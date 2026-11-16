import { describe, expect, it } from "vitest";
import { CharCoachOutput, type CharCoachInput } from "../../contracts/schemas";
import { charCoachFixtures } from "../fixtures";
import { errors, fakeLlm } from "../test-helpers";
import { fallback } from "./fallback";
import { run } from "./index";

const base: CharCoachInput = { ...charCoachFixtures[0]!.input, step: "make_word", history: [{ role: "child", text: "木头" }] };
const realCandidate: CharCoachOutput = {
  say: "字卡里有“休息”和“午休”，你能从“休”想起一个词吗？", ask: null,
  next: "wait_child", usedCardFields: ["explain", "words"],
};
const safeUnknown: CharCoachOutput = { say: "这个词我还不认识，你再想一个书上的", ask: "你想到了哪个词？", next: "wait_child", usedCardFields: ["words"] };

describe("C3B组词完整答案边界", () => {
  it("固定真实char_coach-20输入/输出，替换泄答且不修改输入或候选，只调模型一次", async () => {
    const input = structuredClone(base), candidate = structuredClone(realCandidate);
    const before = structuredClone({ input, candidate });
    const fake = fakeLlm(candidate);
    const result = await run(input, fake);
    expect(result).toEqual(safeUnknown);
    expect(CharCoachOutput.safeParse(result).success).toBe(true);
    expect({ input, candidate }).toEqual(before);
    expect(fake.requests).toHaveLength(1);
  });
  it.each(["休息", "“休息”", "'午休'", '"午休"', "‘休息’"])("say不同引号或无引号%s不能透出完整词", async word => {
    expect(await run(base, fakeLlm({ ...realCandidate, say: `试试${word}。`, next: "step_done" }))).toEqual(safeUnknown);
  });
  it("只在ask泄答也拦截，不让step_done推进", async () => {
    expect(await run(base, fakeLlm({ ...realCandidate, say: "再想想。", ask: "能说午休吗？", next: "step_done" }))).toEqual(safeUnknown);
  });
  it.each([{ history: [] }, { history: [{ role: "child" as const, text: " " }] }])("无孩子回答%j使用不列词的通用问题", async ({ history }) => {
    const result = await run({ ...base, history }, fakeLlm(realCandidate));
    expect(result).toEqual({ ...safeUnknown, say: "再想一个书上的词。" });
  });
  it.each(["午休", "我想到了午休"])("最近孩子逐字提供%s后允许确认，不改原候选", async text => {
    const candidate: CharCoachOutput = { say: "你说了午休。", ask: null, next: "step_done", usedCardFields: ["words"] };
    expect(await run({ ...base, history: [{ role: "child", text }, { role: "agent", text: "再想想" }] }, fakeLlm(candidate))).toBe(candidate);
  });
  it("更早孩子或最近agent提供的词不算最近孩子原话", async () => {
    const history: CharCoachInput["history"] = [{ role: "child", text: "午休" }, { role: "child", text: "木头" }, { role: "agent", text: "休息" }];
    expect(await run({ ...base, history }, fakeLlm(realCandidate))).toEqual(safeUnknown);
  });
  it("孩子已提供一个词仍不能泄另一个", async () => {
    const result = await run({ ...base, history: [{ role: "child", text: "午休" }] }, fakeLlm(realCandidate));
    expect(result.next).toBe("wait_child"); expect(result.say + result.ask).not.toMatch(/休息|午休/);
  });
  it.each(["想想以“休”开头的词。", "你想到了哪个词？"])("首字或通用安全提示%s保持", async say => {
    const candidate = { ...realCandidate, say };
    expect(await run(base, fakeLlm(candidate))).toBe(candidate);
  });
  it.each(["say", "ask"] as const)("单字词不能用%s泄露整个答案", async field => {
    const input = { ...base, card: { ...base.card, words: ["休"] } };
    const candidate = { ...realCandidate, say: "再想想。", [field]: "想想休。" };
    const result = await run(input, fakeLlm(candidate));
    expect(result).toEqual(safeUnknown); expect(result.say + result.ask).not.toContain("休");
    expect(fallback(input).say).toBe("再想一个书上的词。");
  });
  it.each(["explain", "make_sentence"] as const)("其他步骤%s保持原输出", async step => {
    expect(await run({ ...base, step }, fakeLlm(realCandidate))).toBe(realCandidate);
  });
  it("字卡外知识escalate不变", async () => {
    const candidate: CharCoachOutput = { say: "这个我还不知道，我记下来了", ask: null, next: "escalate", usedCardFields: ["explain"] };
    expect(await run(base, fakeLlm(candidate))).toBe(candidate);
  });
  it("escalate夹带完整答案也替换，保留升级语义", async () => {
    expect(await run(base, fakeLlm({ ...realCandidate, next: "escalate" }))).toEqual({
      say: "这个我还不知道，我记下来了", ask: null, next: "escalate", usedCardFields: ["words"],
    });
  });
  it.each(errors)("既有%s失败兜底不变且仍只有一次调用", async error => {
    const fake = fakeLlm(null, error);
    expect(await run(base, fake)).toEqual(fallback(base));
    expect(fake.requests).toHaveLength(1);
  });
});
