import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import configJson from "../../../config/models.json";
import type { ModelConfig } from "../../../src/contracts/llm";
import { createServerDeps } from "../../../src/server/deps";
import { measuredClient, withinBudget, type PendingTurn } from "../../../src/server/model";

const schema = z.object({ answer: z.string() });
function runtime() {
  vi.stubEnv("D2B_FICTIONAL_TOKEN", "fictional-not-a-real-key");
  const config = Object.fromEntries(Object.entries(configJson).map(([agent, route]) => [agent, { ...route, apiKeyEnv: "D2B_FICTIONAL_TOKEN" }])) as ModelConfig;
  return createServerDeps({ config });
}
function response(finish: string, input: number, output: number) {
  return new Response(JSON.stringify({ choices: [{ finish_reason: finish, message: { content: '{"answer":"ok"}', refusal: null } }], usage: { prompt_tokens: input, prompt_cache_hit_tokens: 2, completion_tokens: output } }));
}
function req(user: string) { return { agent: "char_coach" as const, system: "编造规则", user, schema }; }
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("同一真实D2客户端并发、反序完成，拒答与成功的onTurn准确归属且仅一次", async () => {
  const pending: Array<(value: Response) => void> = [];
  const fetchImpl = vi.fn(() => new Promise<Response>(resolve => pending.push(resolve)));
  vi.stubGlobal("fetch", fetchImpl);
  const server = runtime(); const a: PendingTurn[] = []; const b: PendingTurn[] = [];
  const first = withinBudget(server.modelOptions, [], () => measuredClient(server.llm, server.modelOptions, a).call(req("编造A")));
  const second = withinBudget(server.modelOptions, [], () => measuredClient(server.llm, server.modelOptions, b).call(req("编造B")));
  expect(pending).toHaveLength(2);
  pending[1]!(response("content_filter", 31, 9));
  expect(await second).toMatchObject({ ok: false, error: "provider_error" });
  pending[0]!(response("stop", 17, 3));
  expect(await first).toMatchObject({ ok: true });
  expect(a).toHaveLength(1); expect(b).toHaveLength(1);
  expect(a[0]).toMatchObject({ request: { user: "编造A" }, record: { ok: true, inputTokens: 17, cachedInputTokens: 2, outputTokens: 3 } });
  expect(b[0]).toMatchObject({ request: { user: "编造B" }, record: { ok: false, inputTokens: 31, cachedInputTokens: 2, outputTokens: 9 } });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

it("同client一条操作取消不会取消另一条或抢走计量，不重发取消请求", async () => {
  let finish!: (value: Response) => void;
  let cancel!: () => void;
  const signals: AbortSignal[] = [];
  const fetchImpl = vi.fn((_input: unknown, init: RequestInit) => {
    signals.push(init.signal!);
    return new Promise<Response>((resolve, reject) => {
      if (signals.length === 1) init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      else finish = resolve;
    });
  });
  vi.stubGlobal("fetch", fetchImpl);
  const server = runtime(); const a: PendingTurn[] = []; const b: PendingTurn[] = [];
  const options = { ...server.modelOptions, setTimer: (callback: () => void) => { cancel = callback; return 1 as unknown as ReturnType<typeof setTimeout>; }, clearTimer: () => {} };
  const first = withinBudget(options, [], () => measuredClient(server.llm, options, a).call(req("编造取消")));
  const second = withinBudget(server.modelOptions, [], () => measuredClient(server.llm, server.modelOptions, b).call(req("编造继续")));
  cancel();
  expect(await first).toMatchObject({ ok: false, error: "timeout" });
  expect(signals[0]!.aborted).toBe(true); expect(signals[1]!.aborted).toBe(false);
  finish(response("stop", 23, 4));
  expect(await second).toMatchObject({ ok: true });
  await new Promise(resolve => setTimeout(resolve, 550));
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(a).toHaveLength(1); expect(b).toHaveLength(1);
  expect(b[0]!.record).toMatchObject({ ok: true, inputTokens: 23, outputTokens: 4 });
  expect(a[0]!.record?.inputTokens ?? 0).toBe(0);
});
