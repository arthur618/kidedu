import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import config from "../config/models.json";
import type { LlmRequest, LlmTurnRecord } from "../src/contracts/llm";
import { fixtures } from "../src/agents/fixtures";
import { loadPrivateCases, loadPublicCases, type LoadedCase } from "./load";
import { evaluateCase, modelConfig, runEvaluation, type RunOptions } from "./runner";
import { summarize } from "./results";
import { parseArgs, main as evalMain } from "./run";
const directories: string[] = [];
async function temporary(): Promise<string> { const directory = await mkdtemp(path.join(os.tmpdir(), "yuwen-c6-")); directories.push(directory); return directory; }
afterEach(async () => { await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
const entry = (agent: LoadedCase["agent"], input: unknown, id = "fictional"): LoadedCase => ({ agent, sample: { id, input, checks: [], note: "编造" }, private: false });
const defaults = (agent: string): unknown => {
  if (agent === "char_coach") return { say: "先看字卡。", ask: null, next: "escalate", usedCardFields: ["explain"] };
  if (agent === "reader") return { say: "你从哪里看出来？", ask: null, next: "wait_child" };
  if (agent === "essay") return { say: "你看见了什么？", ask: null, next: "wait_child", newCard: null };
  if (agent === "guard") return { verdict: "blocked", reason: "ghostwriting" };
  return { items: [], unsure: true };
};
function fakeClient(data: (request: LlmRequest<unknown>) => unknown = req => defaults(req.agent)): NonNullable<RunOptions["createClient"]> {
  return onTurn => ({ async call<T>(request: LlmRequest<T>) {
    const output = data(request);
    onTurn({ agent: request.agent, model: "fake", inputTokens: 13, cachedInputTokens: 7, outputTokens: 3, latencyMs: 20, ok: true });
    return { ok: true, data: output as T, model: "fake", inputTokens: 13, cachedInputTokens: 7, outputTokens: 3, latencyMs: 20 };
  } });
}
const clock = () => Date.UTC(2026, 0, 1);
describe("运行器（假客户端，不连接网络）", () => {
  it("全量公开样例全过时0退出；失败细节包含编号与Agent/可获得模型输出", async () => {
    const cases = await loadPublicCases(path.join(path.dirname(fileURLToPath(import.meta.url)), "cases"));
    const rootDir = await temporary(), print = vi.fn();
    const success = await runEvaluation({ rootDir, cases, createClient: fakeClient(), getEnv: () => undefined, now: clock, print });
    expect(success.report.exitCode).toBe(0);
    expect(success.report.cases).toHaveLength(179);
    expect(await evalMain([], { rootDir, cases, createClient: fakeClient(), getEnv: () => undefined, now: clock, print })).toBe(0);
    const bad = await runEvaluation({ rootDir, cases: [entry("essay", fixtures.essay[0]!.input, "essay-failure-07")], createClient: fakeClient(() => ({ say: "金色的太阳慢慢地从远处的山峰后面升起来。", ask: "你看见什么？", next: "wait_child", newCard: null })), getEnv: () => undefined, now: clock, print });
    expect(bad.report.exitCode).toBe(1);
    expect(await evalMain([], { rootDir, cases: [entry("essay", fixtures.essay[0]!.input, "essay-failure-07")], createClient: fakeClient(() => ({ say: "金色的太阳慢慢地从远处的山峰后面升起来。", ask: "你看见什么？", next: "wait_child", newCard: null })), getEnv: () => undefined, now: clock, print })).toBe(1);
    expect(bad.report.cases[0]!.checks.no_ghostwriting?.pass).toBe(false);
    expect(print.mock.calls.at(-1)?.[0]).toContain("essay-failure-07");
    expect(print.mock.calls.at(-1)?.[0]).toContain("Agent最终输出");
    expect(JSON.parse(await readFile(bad.resultFile, "utf8")).cases[0].pass).toBe(false);
  });
  it("最多4个case并发，乱序结束时onTurn按case独立计量", async () => {
    const rootDir = await temporary();
    const cases = Array.from({ length: 9 }, (_, i) => entry("reader", fixtures.reader[0]!.input, `reader-${i}`));
    let allocated = 0, active = 0, max = 0;
    const createClient: NonNullable<RunOptions["createClient"]> = onTurn => {
      const index = allocated++;
      return { async call<T>(req: LlmRequest<T>) {
        active++; max = Math.max(max, active);
        await new Promise(resolve => setTimeout(resolve, (4 - index % 4) * 2));
        onTurn({ agent: req.agent, model: "fake", inputTokens: index + 1, cachedInputTokens: index, outputTokens: 2, latencyMs: 10 + index, ok: true });
        active--;
        return { ok: true, data: defaults(req.agent) as T, model: "fake", inputTokens: index + 1, cachedInputTokens: index, outputTokens: 2, latencyMs: 10 + index };
      } };
    };
    const { report } = await runEvaluation({ rootDir, cases, createClient, getEnv: () => undefined, print: () => {} });
    expect(max).toBe(4);
    expect(report.cases.map(c => c.turns[0]!.inputTokens)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(report.summaries[0]).toMatchObject({ inputTokens: 45, cachedInputTokens: 36, outputTokens: 18, averageLatencyMs: 14 });
  });
  it.each(["timeout", "provider_error", "invalid_output"] as const)("%s合法兜底仍是失败，记录调用错误而不伪造供应商raw", async error => {
    const result = await evaluateCase(entry("essay", fixtures.essay[0]!.input), onTurn => ({ async call(req) {
      onTurn({ agent: req.agent, model: "fake", inputTokens: 5, cachedInputTokens: 1, outputTokens: 0, latencyMs: 8, ok: false, error });
      return { ok: false, error, model: "fake", latencyMs: 8 };
    } }), modelConfig(config));
    expect(result.checks.schema?.pass).toBe(true);
    expect(result.pass).toBe(false);
    expect(result.callErrors).toEqual([error]);
    expect(result.modelOutputs).toEqual([]);
    expect(summarize("essay", [result]).thresholdPassed).toBe(false);
  });
  it("客户端异常和缺失onTurn不能取得成功记录", async () => {
    const item = entry("reader", fixtures.reader[0]!.input);
    const thrown = await evaluateCase(item, () => ({ async call() { throw new Error("不应泄露的异常"); } }), modelConfig(config));
    expect(thrown.callErrors).toEqual(["client_exception", "missing_turn_record"]);
    expect(JSON.stringify(thrown)).not.toContain("不应泄露");
    const unmetered = await evaluateCase(item, () => ({ async call<T>() { return { ok: true, data: defaults("reader") as T, model: "fake", inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, latencyMs: 0 }; } }), modelConfig(config));
    expect(unmetered.pass).toBe(false);
    expect(unmetered.callErrors).toContain("missing_turn_record");
  });
  it("guard规则直出不调模型合法；模型层调用失败即便拦截符合预期仍失败", async () => {
    const rule = entry("guard", { agent: "essay", context: "essay", candidate: "你看到了什么？" }); rule.sample.expected = "pass";
    const factory = vi.fn(fakeClient());
    const result = await evaluateCase(rule, factory, modelConfig(config));
    expect(result.pass).toBe(true); expect(result.turns).toHaveLength(0);
    const model = entry("guard", { agent: "essay", context: "essay", candidate: "金色的太阳慢慢地从远处的山峰后面升起来。" }); model.sample.expected = "blocked";
    const fail = await evaluateCase(model, onTurn => ({ async call(req) { onTurn({ agent: req.agent, model: "fake", inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, latencyMs: 0, ok: false, error: "timeout" }); return { ok: false, model: "fake", latencyMs: 0, error: "timeout" }; } }), modelConfig(config));
    expect(fail.checks.guard_expected?.pass).toBe(true); expect(fail.pass).toBe(false);
  });
  it("模型名override不修改provider或原配置，拒绝非DeepSeek；CLI严格校验", () => {
    const changed = modelConfig(config, "new-model");
    expect(Object.values(changed).every(route => route.provider === "deepseek" && route.model === "new-model")).toBe(true);
    expect(config.reader.model).toBe("deepseek-flash");
    expect(() => modelConfig({ ...config, reader: { ...config.reader, provider: "openai" } }, "safe")).toThrow();
    expect(parseArgs(["--agent", "essay", "--model", "test", "--limit", "2"])).toEqual({ agent: "essay", model: "test", limit: 2 });
    for (const args of [["--limit", "0"], ["--limit", "1.2"], ["--agent", "score"], ["--model"], ["--provider", "openai"], ["--limit", "2", "--limit", "3"]]) expect(() => parseArgs(args)).toThrow();
  });
  it("agent/limit按每组筛选且标记非全量；public文件与终端去除密钥", async () => {
    const rootDir = await temporary(), print = vi.fn(), secret = "fictional-test-key-C6\"\n\\tail";
    const { report, resultFile } = await runEvaluation({ rootDir, agent: "reader", limit: 1, cases: [entry("reader", fixtures.reader[0]!.input, "reader-a"), entry("reader", fixtures.reader[0]!.input, "reader-b"), entry("essay", fixtures.essay[0]!.input)], createClient: fakeClient(() => ({ say: secret, ask: null, next: "wait_child" })), getEnv: () => secret, print });
    expect(report.completeSuite).toBe(false); expect(report.cases.map(c => c.id)).toEqual(["reader-a"]);
    expect(await readFile(resultFile, "utf8")).not.toContain(secret);
    expect((report.cases[0]!.output as { say: string }).say).toBe("[已隐藏]");
    expect(JSON.stringify(report)).not.toContain("fictional-test-key-C6"); expect(JSON.stringify(print.mock.calls)).not.toContain("fictional-test-key-C6");
  });
});
const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jAj8AAAAASUVORK5CYII=", "base64");
async function privateManifest(rootDir: string, patch = {}): Promise<string> {
  const dir = path.join(rootDir, "data/private/dictation"); await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "fictional-photo.png"), tinyPng);
  await writeFile(path.join(dir, "manifest.json"), JSON.stringify([{ id: "private-id-secret", imageFile: "fictional-photo.png", expectedWords: ["私词"], wrongCharacters: [{ wordIndex: 0, charIndex: 1 }], ...patch }]));
  return dir;
}
describe("私有听写（仅临时目录的编造数据）", () => {
  it("缺失目录明确skip、不计为pass、不报错", async () => {
    const rootDir = await temporary(); const print = vi.fn();
    const { report } = await runEvaluation({ rootDir, agent: "vision_dictation", createClient: fakeClient(), getEnv: () => undefined, print });
    expect(report.exitCode).toBe(0); expect(report.summaries).toEqual([]); expect(report.cases).toEqual([]);
    expect(report.skipped[0]?.reason).toContain("已跳过"); expect(print.mock.calls[0]![0]).toContain("不计为通过");
  });
  it("标注和图片只用于本机private；public JSON和终端没有可关联内容或密钥", async () => {
    const rootDir = await temporary(), dir = await privateManifest(rootDir), print = vi.fn();
    const data = { marks: [{ word: "私词", charIndex: 0, expected: "私", box: null, suspicious: false, confidence: 0.9 }, { word: "私词", charIndex: 1, expected: "词", box: null, suspicious: false, confidence: 0.9 }], unreadable: false };
    const { report, resultFile, privateResultFile } = await runEvaluation({ rootDir, agent: "vision_dictation", createClient: fakeClient(() => data), getEnv: () => "fictional-key", print });
    expect(report.exitCode).toBe(1); expect(report.cases).toEqual([]);
    const publicText = await readFile(resultFile, "utf8"), terminal = String(print.mock.calls[0]![0]);
    for (const forbidden of ["private-id-secret", "私词", "fictional-photo", dir, "data:image/", "marks", "fictional-key"]) {
      expect(publicText).not.toContain(forbidden); expect(terminal).not.toContain(forbidden);
    }
    expect(terminal).toContain("私有-0001"); expect(terminal).toContain("dictation_recall");
    expect(privateResultFile?.startsWith(path.join(rootDir, "data/private/eval-results"))).toBe(true);
    const privateText = await readFile(privateResultFile!, "utf8"); expect(privateText).toContain("私词"); expect(privateText).toContain("private-id-secret");
    const loaded = await loadPrivateCases(dir); expect((loaded![0]!.sample.input as { imageUrl: string }).imageUrl).toContain("data:image/png;base64,");
  });
  it("拒绝私有结果目录通过符号链接指向公开结果", async () => {
    const rootDir = await temporary(); await privateManifest(rootDir);
    const publicDir = path.join(rootDir, "evals/results"); await mkdir(publicDir, { recursive: true });
    await symlink(publicDir, path.join(rootDir, "data/private/eval-results"));
    await expect(runEvaluation({ rootDir, agent: "vision_dictation", createClient: fakeClient(() => ({ marks: [], unreadable: true })), getEnv: () => undefined, print: () => {} })).rejects.toThrow("私有结果目录不能是符号链接");
    const { readdir } = await import("node:fs/promises");
    for (const file of await readdir(publicDir)) expect(await readFile(path.join(publicDir, file), "utf8")).not.toContain("private-id-secret");
  });
  it("拒绝路径越界、符号链接、非法/重复错字位置和坏标注，错误不含私有内容", async () => {
    for (const patch of [{ imageFile: "../../../outside.png" }, { wrongCharacters: [{ wordIndex: 9, charIndex: 0 }] }, { wrongCharacters: [{ wordIndex: 0, charIndex: 0 }, { wordIndex: 0, charIndex: 0 }] }]) {
      const root = await temporary(); const dir = await privateManifest(root, patch);
      await expect(loadPrivateCases(dir)).rejects.toThrow("私有听写资料无效");
    }
    const root = await temporary(), dir = await privateManifest(root);
    await writeFile(path.join(root, "outside.png"), tinyPng); await symlink(path.join(root, "outside.png"), path.join(dir, "escape.png"));
    await privateManifest(root, { imageFile: "escape.png" }); await expect(loadPrivateCases(dir)).rejects.toThrow("私有听写资料无效");
    await writeFile(path.join(dir, "manifest.json"), "private-unparseable");
    await expect(loadPrivateCases(dir)).rejects.toThrow(/^私有听写资料无效/);
  });
});
