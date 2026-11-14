import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { ModelConfig } from "../../../src/contracts/llm";
import { DailyReportSchema } from "../../../src/contracts/nightly";
import { database } from "../helpers";
import { getPrisma } from "../../../src/db/client";
import { createLlmClient } from "../../../src/llm/client";
import config from "../../../config/models.json";
import { captureTurn } from "../../../src/server/model";
import { LEASE_MS } from "../../../src/db/nightly/store";
import { createNightlyRunner } from "../../../src/nightly/run";
import { parseArgs, runCli } from "../../../src/nightly/cli";
import { factualFallback } from "../../../src/nightly/agents";
import { child, session, reading, request, fakeModel, moment, gate, reason, transcript } from "./helpers";
let db: Awaited<ReturnType<typeof database>>;
beforeAll(async () => { db = await database(); }); afterAll(async () => { await db.cleanup(); });
const now = () => new Date(moment);
const routes = (): ModelConfig => ({ ...config, score: { ...config.score, model: "test-score" }, report: { ...config.report, model: "test-report" } }) as ModelConfig;
it("真实D2客户端失败重试累计tokens/cache，onTurn与同客户端并发不串session或score/report记录", async () => {
  const a = await child(), b = await child(); const sa = await session(a, "2026-11-14T01:00:00.000Z", "2026-11-14T01:10:00.000Z"), sb = await session(b, "2026-11-14T02:00:00.000Z", "2026-11-14T02:10:00.000Z");
  await reading(sa, "2026-11-14T01:05:00.000Z"); await reading(sb, "2026-11-14T02:05:00.000Z");
  const entered = gate(), release = gate(); let count = 0; const httpCalls: string[] = [];
  const fakeFetch: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)); httpCalls.push(body.model);
    if (body.model === "test-score" && ++count <= 2) { if (count === 2) entered.open(); await release.wait; }
    const data = body.model === "test-score" ? { score: 4, reason } : factualFallback(JSON.parse(body.messages.at(-1).content));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(data) }, finish_reason: "stop" }], usage: { prompt_tokens: body.model === "test-score" ? 17 : 23, prompt_cache_hit_tokens: body.model === "test-score" ? 4 : 6, completion_tokens: body.model === "test-score" ? 8 : 9 } }));
  };
  const realClient = createLlmClient({ config: routes(), fetch: fakeFetch, getEnv: () => "synthetic-key-no-network", now: () => 100, onTurn: captureTurn, sleep: async () => undefined });
  const run = createNightlyRunner({ config: routes(), llm: realClient, now, modelOptions: { nowMs: () => 100 } });
  const pending = Promise.all([run(request(a)), run(request(b))]); await entered.wait; release.open(); const reports = await pending;
  expect(reports.every(r => r.retellScores[0]!.result === null && r.summaryStatus === "generated")).toBe(true);
  for (const s of [sa, sb]) {
    const turns = await getPrisma().turn.findMany({ where: { sessionId: s.id } }); expect(turns).toHaveLength(2);
    const score = turns.find(t => t.agent === "score")!, report = turns.find(t => t.agent === "report")!;
    expect(score).toMatchObject({ model: "test-score", inputTokens: 34, cachedInputTokens: 8, outputTokens: 16 }); expect(JSON.parse(score.output).error).toBe("invalid_output");
    expect(report).toMatchObject({ model: "test-report", inputTokens: 23, cachedInputTokens: 6, outputTokens: 9 }); expect(JSON.parse(report.input).sourceSessionIds).toEqual([s.id]);
    expect(JSON.stringify(turns)).not.toContain("synthetic-key"); expect(JSON.stringify(turns)).not.toContain(transcript[0]);
  }
  expect(httpCalls.filter(m => m === "test-score")).toHaveLength(4); expect(httpCalls.filter(m => m === "test-report")).toHaveLength(2);
});
it("真实D2无凭据不触网络并诚实fallback；生产配置和工厂都拒绝非DeepSeek", async () => {
  const id = await child(); const s = await session(id, "2026-11-14T01:00:00.000Z", "2026-11-14T01:10:00.000Z"); await reading(s, "2026-11-14T01:05:00.000Z");
  const network = vi.fn(async () => new Response("unexpected"));
  const llm = createLlmClient({ config: routes(), fetch: network, getEnv: () => undefined, now: () => 100, onTurn: captureTurn });
  const report = await createNightlyRunner({ llm, now })(request(id)); expect(report.summaryStatus).toBe("fallback"); expect(report.retellScores[0]!.result).toBeNull(); expect(network).not.toHaveBeenCalled();
  const turns = await getPrisma().turn.findMany({ where: { sessionId: s.id } }); expect(turns).toHaveLength(2); expect(turns.every(t => t.inputTokens === 0 && JSON.parse(t.output).error === "provider_error")).toBe(true);
  const bad = routes(); bad.report.provider = "openai"; expect(() => createNightlyRunner({ config: bad, llm: fakeModel().llm })).toThrow("deepseek");
});
it("模型总预算超时具体记录timeout，迟到返回不能发布候选", async () => {
  const id = await child(); const s = await session(id, "2026-11-14T01:00:00.000Z", "2026-11-14T01:10:00.000Z");
  const fake = fakeModel(async () => new Promise(() => undefined));
  const report = await createNightlyRunner({ llm: fake.llm, now, modelOptions: { setTimer: callback => setTimeout(callback, 5) } })(request(id));
  expect(report.summaryStatus).toBe("fallback"); const turn = await getPrisma().turn.findFirst({ where: { sessionId: s.id } }); expect(JSON.parse(turn!.output).error).toBe("timeout");
});
it("CLI要求显式孩子/真实日期；默认不扫库，可注入调度/输出，未知与重复参数拒绝", async () => {
  for (const args of [[], ["--date", "2026-11-14"], ["--child-id", "fake"], ["--child-id", "fake", "--date", "2026-02-29"], ["--all"], ["--child-id", "fake", "--child-id", "second"], ["--retry-failed", "--retry-failed"]]) expect(() => parseArgs(args)).toThrow();
  expect(parseArgs(["--child-id", "fake", "--date", "2026-11-14", "--retry-failed"])).toEqual({ childId: "fake", date: "2026-11-14", timezone: "Asia/Shanghai", retryFailed: true });
  const id = await child(); const output: string[] = []; const fake = fakeModel();
  await runCli(["--child-id", id, "--date", "2026-11-14", "--timezone", "UTC"], { run: createNightlyRunner({ llm: fake.llm, now }), write: text => output.push(text) });
  expect(DailyReportSchema.parse(JSON.parse(output[0]!)).facts.sessionIds).toEqual([]); expect(fake.calls).toHaveLength(0);
});
it("真实迁移SQLite的tsx CLI：默认无凭据烟测与工厂假依赖烟测，不依赖真实环境密钥", async () => {
  const id = await child(); const s = await session(id, "2026-11-14T01:00:00.000Z", "2026-11-14T01:10:00.000Z"); await reading(s, "2026-11-14T01:05:00.000Z");
  const env = { PATH: process.env.PATH, DATABASE_URL: db.url, XDG_CACHE_HOME: process.env.XDG_CACHE_HOME };
  const bin = resolve("node_modules/.bin/tsx");
  const raw = execFileSync(bin, ["src/nightly/cli.ts", "--child-id", id, "--date", "2026-11-14"], { env, encoding: "utf8" });
  const report = DailyReportSchema.parse(JSON.parse(raw)); expect(report.summaryStatus).toBe("fallback"); expect(report.retellScores[0]!.result).toBeNull();
  const dir = mkdtempSync(join(tmpdir(), "nightly-cli-fake-"));
  try {
    const script = join(dir, "smoke.mts");
    writeFileSync(script, `import { runCli } from ${JSON.stringify(resolve("src/nightly/cli.ts"))};\nimport { createNightlyRunner } from ${JSON.stringify(resolve("src/nightly/run.ts"))};\nimport { factualFallback } from ${JSON.stringify(resolve("src/nightly/agents.ts"))};\nimport { disconnectPrisma } from ${JSON.stringify(resolve("src/db/client.ts"))};\nconst llm = { async call(req) { const data = req.agent === 'score' ? {score:3,reason:'编造私有理由'} : factualFallback(JSON.parse(req.user)); return {ok:true,data,model:'fake-cli',inputTokens:5,cachedInputTokens:1,outputTokens:2,latencyMs:1}; } };\ntry { await runCli(process.argv.slice(2), {run:createNightlyRunner({llm}),write:text=>process.stdout.write(text)}); } finally { await disconnectPrisma(); }\n`);
    const repaired = DailyReportSchema.parse(JSON.parse(execFileSync(bin, [script, "--child-id", id, "--date", "2026-11-14", "--retry-failed"], { env, encoding: "utf8" })));
    expect(repaired.retellScores[0]!.result!.score).toBe(3); expect(repaired.summaryStatus).toBe("generated"); expect(repaired.sourceVersion).toBe(report.sourceVersion);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 20000);
it("真实子进程SIGKILL留下持久running步骤与租约，重启后过期CAS接管并重新调用", async () => {
  const id = await child(); const s = await session(id, "2026-11-14T01:00:00.000Z", "2026-11-14T01:10:00.000Z"); await reading(s, "2026-11-14T01:05:00.000Z");
  const dir = mkdtempSync(join(tmpdir(), "nightly-crash-")); let processHandle: ReturnType<typeof spawn> | undefined;
  try {
    const script = join(dir, "crash.mts");
    writeFileSync(script, `import { createNightlyRunner } from ${JSON.stringify(resolve("src/nightly/run.ts"))};\nconst llm = { async call() { process.stdout.write('synthetic-model-started\\n'); await new Promise(resolve => setTimeout(resolve,60000)); throw new Error('unreachable'); } };\nawait createNightlyRunner({llm,now:()=>new Date(${JSON.stringify(moment)})})(${JSON.stringify(request(id))});\n`);
    processHandle = spawn(process.execPath, ["--import", "tsx", script], { env: { PATH: process.env.PATH, DATABASE_URL: db.url, XDG_CACHE_HOME: process.env.XDG_CACHE_HOME }, stdio: ["ignore", "pipe", "pipe"] });
    const proc = processHandle;
    await new Promise<void>((resolveStarted, reject) => {
      const timer = setTimeout(() => reject(new Error("子进程启动超时")), 15000);
      proc.once("error", e => { clearTimeout(timer); reject(e); }); proc.once("exit", () => { clearTimeout(timer); reject(new Error("子进程提前退出")); });
      proc.stdout!.on("data", data => { if (String(data).includes("synthetic-model-started")) { clearTimeout(timer); resolveStarted(); } });
    });
    const exited = once(proc, "exit"); proc.kill("SIGKILL"); await exited;
    const job = await getPrisma().nightlyJob.findFirst({ where: { childId: id } }); expect(job!.final).toBeNull(); expect(job!.leaseToken).not.toBeNull(); expect((await getPrisma().nightlyStep.findFirst({ where: { jobId: job!.id } }))!.status).toBe("running");
    const fake = fakeModel(); const report = await createNightlyRunner({ llm: fake.llm, now: () => new Date(Date.parse(moment) + LEASE_MS + 1) })(request(id));
    expect(report.retellScores[0]!.result!.score).toBe(0); expect(report.summaryStatus).toBe("generated"); expect(fake.calls).toHaveLength(2);
  } finally { if (processHandle && processHandle.exitCode === null && processHandle.signalCode === null) processHandle.kill("SIGKILL"); rmSync(dir, { recursive: true, force: true }); }
}, 20000);
