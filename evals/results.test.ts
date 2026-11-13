import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { diffReports, main as diffMain } from "./diff";
import { summarize } from "./results";
import type { CaseResult, EvalAgent } from "./types";
function result(agent: EvalAgent, index: number, checks: Record<string, boolean> = {}): CaseResult {
  return { id: `fictional-${index}`, agent, pass: Object.values(checks).every(Boolean), output: {}, modelOutputs: [], callErrors: [], turns: [], wrongTotal: 0, missedWrong: 0, checks: Object.fromEntries(Object.entries({ schema: true, call_success: true, ...checks }).map(([name, pass]) => [name, { pass, detail: "测试" }])) };
}
describe("阈值边界", () => {
  it("char_grounded必须100%，其余95%；reader/essay分别90%且硬检查100%", () => {
    const coach = Array.from({ length: 20 }, (_, i) => result("char_coach", i, { card_grounded: true, max_two_sentences: i > 0 }));
    expect(summarize("char_coach", coach).thresholdPassed).toBe(true);
    coach[1]!.checks.max_two_sentences!.pass = false;
    expect(summarize("char_coach", coach).thresholdPassed).toBe(false);
    coach[1]!.checks.max_two_sentences!.pass = true; coach[0]!.checks.card_grounded!.pass = false;
    expect(summarize("char_coach", coach).thresholdPassed).toBe(false);
    for (const agent of ["reader", "essay"] as const) {
      const hard = agent === "reader" ? "no_answer_leak" : "no_ghostwriting";
      const cases = Array.from({ length: 10 }, (_, i) => result(agent, i, { [hard]: true, max_two_sentences: i > 0 }));
      expect(summarize(agent, cases).thresholdPassed).toBe(true);
      cases[1]!.checks.max_two_sentences!.pass = false;
      expect(summarize(agent, cases).thresholdPassed).toBe(false);
      cases[1]!.checks.max_two_sentences!.pass = true; cases[0]!.checks[hard]!.pass = false;
      expect(summarize(agent, cases).thresholdPassed).toBe(false);
      if (agent === "essay") { cases[0]!.checks[hard]!.pass = true; cases[0]!.checks.card_is_verbatim = { pass: false, detail: "测试" }; expect(summarize(agent, cases).thresholdPassed).toBe(false); }
    }
  });
  it("guard允许恰好2次漏拦、10次误拦，任一超出即失败", () => {
    const cases = Array.from({ length: 100 }, (_, i) => ({ ...result("guard", i), expected: (i < 60 ? "blocked" : "pass") as "blocked" | "pass", output: { verdict: i < 2 || i >= 70 ? "pass" : "blocked" } }));
    expect(summarize("guard", cases)).toMatchObject({ thresholdPassed: true, falseNegatives: 2, falsePositives: 10 });
    cases[2]!.output.verdict = "pass"; expect(summarize("guard", cases).thresholdPassed).toBe(false);
    cases[2]!.output.verdict = "blocked"; cases[70]!.output.verdict = "blocked"; expect(summarize("guard", cases).thresholdPassed).toBe(false);
  });
  it("听写按全体错字汇总，2%边界、无错字分母和schema都处理", () => {
    const cases = [{ ...result("vision_dictation", 1), wrongTotal: 50, missedWrong: 1 }, { ...result("vision_dictation", 2), wrongTotal: 50, missedWrong: 1 }];
    expect(summarize("vision_dictation", cases).thresholdPassed).toBe(true);
    cases[1]!.missedWrong++; expect(summarize("vision_dictation", cases).thresholdPassed).toBe(false);
    expect(summarize("vision_dictation", [result("vision_dictation", 1)]).thresholdPassed).toBe(true);
    expect(summarize("vision_homework", [result("vision_homework", 1, { schema: false })]).thresholdPassed).toBe(false);
  });
});
const dirs: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
describe("结果比较", () => {
  const before = { version: 1, summaries: [{ agent: "essay", passRate: 1 }], cases: [{ agent: "essay", id: "essay-07", pass: true }, { agent: "essay", id: "essay-08", pass: false }], skipped: [] };
  const after = { ...before, summaries: [{ agent: "essay", passRate: 0.5 }], cases: [{ agent: "essay", id: "essay-07", pass: false }, { agent: "essay", id: "essay-08", pass: true }] };
  it("通过率变化与由通过变失败的样例正确，改善样例不列作退化", () => {
    const diff = diffReports(before, after);
    expect(diff).toContain("100.0%  50.0%  -50.0"); expect(diff).toContain("essay/essay-07"); expect(diff).not.toContain("essay/essay-08");
    const privateDiff = diffReports({ ...before, summaries: [{ agent: "vision_dictation", passRate: 1 }], cases: [{ agent: "vision_dictation", id: "private-id", pass: true }] }, { ...after, summaries: [{ agent: "vision_dictation", passRate: 0 }], cases: [{ agent: "vision_dictation", id: "private-id", pass: false }] });
    expect(privateDiff).not.toContain("private-id"); expect(privateDiff).toContain("仅比较汇总");
  });
  it("实际读取两份编造结果文件并输出diff；坏文件和私有路径返回1且不打印内容", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "yuwen-c6-diff-")); dirs.push(directory);
    const a = path.join(directory, "a.json"), b = path.join(directory, "b.json");
    await writeFile(a, JSON.stringify(before)); await writeFile(b, JSON.stringify(after));
    const log = vi.spyOn(console, "log").mockImplementation(() => {}), error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await diffMain([a, b])).toBe(0); expect(log.mock.calls[0]![0]).toContain("essay/essay-07");
    await writeFile(b, "fictional-sensitive-content"); expect(await diffMain([a, b])).toBe(1);
    expect(await diffMain([a, path.join(directory, "private", "b.json")])).toBe(1);
    expect(JSON.stringify(error.mock.calls)).not.toContain("fictional-sensitive-content");
  });
});
