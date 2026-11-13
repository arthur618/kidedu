import { beforeAll, beforeEach, afterAll, afterEach, expect, it, vi } from "vitest";
import configJson from "../../config/models.json";
import type { ModelConfig } from "../../src/contracts/llm";
import { CharCoachOutput } from "../../src/contracts/schemas";
import { testCard, testChild } from "../../src/db/test-fixtures";
import * as turnDb from "../../src/db/turn";
import { getPrisma } from "../../src/db/client";
import { createServerDeps } from "../../src/server/deps";
import { measuredClient, persistTurns, withinBudget, type PendingTurn } from "../../src/server/model";
import { runCharCoach } from "../../src/agents";
import { database, seed } from "./helpers";
let db: Awaited<ReturnType<typeof database>>;
beforeAll(async () => { db = await database(); }, 60000); beforeEach(seed); afterAll(async () => { await db.cleanup(); }); afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const output = { say: "看看字卡。", ask: null, next: "wait_child", usedCardFields: ["explain"] };
function deps() {
  vi.stubEnv("C7_FICTIONAL_MODEL_TOKEN", "fictional-not-a-real-key");
  const config = Object.fromEntries(Object.entries(configJson).map(([agent, route]) => [agent, { ...route, apiKeyEnv: "C7_FICTIONAL_MODEL_TOKEN" }])) as ModelConfig;
  return createServerDeps({ config });
}
it("[23] 真实D2 onTurn与当前请求配对，准确保存token；Turn写失败明确传播", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 99, prompt_cache_hit_tokens: 17, completion_tokens: 8 } }))));
  const runtime = deps(); const turns: PendingTurn[] = [];
  await withinBudget(runtime.modelOptions, [], async () => {
    await runCharCoach({ child: testChild, card: testCard, step: "explain", history: [] }, { llm: measuredClient(runtime.llm, runtime.modelOptions, turns) });
    await persistTurns("fictional-model-session", turns, "pass", runtime.now);
  });
  const saved = await getPrisma().turn.findMany(); expect(saved).toHaveLength(1); expect(saved[0]).toMatchObject({ inputTokens: 99, cachedInputTokens: 17, outputTokens: 8, model: configJson.char_coach.model, sessionId: "fictional-model-session" });
  vi.spyOn(turnDb, "insertTurn").mockRejectedValueOnce(new Error("fictional_storage_failure"));
  await expect(withinBudget(runtime.modelOptions, [], async () => {
    await runCharCoach({ child: testChild, card: testCard, step: "explain", history: [] }, { llm: measuredClient(runtime.llm, runtime.modelOptions, turns) });
    await persistTurns("fictional-model-session", turns, "pass", runtime.now);
  })).rejects.toThrow("fictional_storage_failure");
});
it("[22] 真实fetch绑定整体预算取消信号，超时记录仍保留实际路由模型名", async () => {
  let signal: AbortSignal | undefined; let cancel: (() => void) | undefined; let clock = 1000;
  vi.stubGlobal("fetch", vi.fn((_url: unknown, init: RequestInit) => new Promise((_resolve, reject) => { signal = init.signal!; signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }); })));
  const runtime = deps(); runtime.modelOptions.nowMs = () => clock; runtime.modelOptions.setTimer = ((callback: () => void) => { cancel = callback; return 1 as unknown as ReturnType<typeof setTimeout>; }); runtime.modelOptions.clearTimer = () => {};
  const turns: PendingTurn[] = [];
  const pending = withinBudget(runtime.modelOptions, [], async () => {
    const result = await measuredClient(runtime.llm, runtime.modelOptions, turns).call({ agent: "char_coach", system: "编造规则", user: "编造资料", schema: CharCoachOutput });
    await persistTurns("fictional-budget-session", turns, "pass", runtime.now); return result;
  });
  while (!signal) await new Promise(resolve => setTimeout(resolve, 1)); clock = 1037; cancel!();
  expect((await pending).ok).toBe(false); expect(signal.aborted).toBe(true);
  const turn = await getPrisma().turn.findFirst();
  expect(turn?.model).toBe(configJson.char_coach.model); expect(turn?.latencyMs).toBe(37);
  const count = await getPrisma().turn.count(); await new Promise(resolve => setTimeout(resolve, 10)); expect(await getPrisma().turn.count()).toBe(count);
});
