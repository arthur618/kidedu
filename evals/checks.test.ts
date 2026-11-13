import { describe, expect, it } from "vitest";
import { checks, dictationCounts, sentences } from "./checks";
import type { CheckInput, EvalCase, EvalAgent } from "./types";
import { charCoachFixtures, essayFixtures, readerFixtures } from "../src/agents/fixtures";
const context = (agent: EvalAgent, input: unknown, patch: Partial<EvalCase> = {}): CheckInput => ({ agent, sample: { id: "test", input, note: "编造测试", checks: [], ...patch } });
const coach = context("char_coach", charCoachFixtures[0]!.input);
const essay = context("essay", { ...essayFixtures[0]!.input, history: [{ role: "child", text: "我看见一只蓝色的小船在小池塘里慢慢漂动。" }] });
const reader = context("reader", readerFixtures[0]!.input);
const speech = { say: "先看字卡。", ask: null, next: "wait_child", usedCardFields: ["explain"] };
const scenarios: Array<[string, CheckInput, unknown, unknown]> = [
  ["schema", coach, speech, { ...speech, next: "未知" }],
  ["max_two_sentences", coach, { say: "看。想！" }, { say: "看。想！说？" }],
  ["card_grounded", coach, { ...speech, say: "“休息”和‘体’在字卡里。" }, { ...speech, say: "“蓝天”是什么？" }],
  ["no_ghostwriting", essay, { say: "我看见一只蓝色的小船在小池塘里慢慢漂动。" }, { say: "金色的太阳慢慢地从远处的山峰后面升起来。" }],
  ["asks_question", essay, { say: "你看到了什么？" }, { say: "先想想。", ask: null }],
  ["card_is_verbatim", essay, { newCard: "蓝色的小船" }, { newCard: "美丽的小船" }],
  ["no_answer_leak", reader, { say: "你从哪里看出来？" }, { say: "怕纸船被风吹走呀。" }],
  ["escalates", { ...coach, sample: { ...coach.sample, shouldEscalate: true } }, { next: "escalate" }, { next: "wait_child" }],
  ["guard_expected", context("guard", {}, { expected: "blocked" }), { verdict: "blocked" }, { verdict: "pass" }],
  ["dictation_recall", context("vision_dictation", { imageUrl: "data:image/png;base64,AA==", expectedWords: ["木"] }, { wrongCharacters: [{ wordIndex: 0, charIndex: 0 }] }), { marks: [{ word: "木", charIndex: 0, expected: "木", suspicious: true }] }, { marks: [{ word: "木", charIndex: 0, expected: "木", suspicious: false }] }],
];
describe("纯检查的通过与失败", () => {
  it.each(scenarios)("%s", (name, input, pass, fail) => {
    expect(checks[name]!(input, pass).pass).toBe(true);
    expect(checks[name]!(input, fail).pass).toBe(false);
  });
  it("引号不能掩盖新增长句，空引用字段也不通过", () => {
    expect(checks.card_grounded!(coach, { ...speech, usedCardFields: [] }).pass).toBe(false);
    expect(checks.no_ghostwriting!(essay, { say: "“我看见一只蓝色的小船在小池塘里慢慢漂动”，金色光芒洒满了大地。" }).pass).toBe(false);
    expect(checks.no_ghostwriting!(essay, { say: "“我看见一只蓝色的小船在小池塘里慢慢漂动”。" }).pass).toBe(true);
  });
  it.each([
    ["“", "”"], ["‘", "’"], ['"', '"'], ["'", "'"],
  ])("完整原话引用%s%s支持引号内外句号及多句边界", (open, close) => {
    const first = "我看见一只蓝色的小船在小池塘里慢慢漂动";
    const second = "后来我又看见小船慢慢地漂到了池塘中间";
    const input = context("essay", { ...essayFixtures[0]!.input, history: [{ role: "child", text: `${first}。${second}。` }] });
    for (const say of [
      `${open}${first}。${close}`, `${open}${first}${close}。`,
      `${open}${first}。${second}。${close}`, `${open}${first}。${second}${close}。`,
      `${open}${first}。${close}${open}${second}。${close}`,
    ]) expect(checks.no_ghostwriting!(input, { say }).pass).toBe(true);
    const invented = "金色的太阳慢慢地从远处的山峰后面升起来。";
    for (const say of [
      `${open}${first}。${close}${invented}`,
      `${open}${first}${close}。${invented}`,
      `${open}${first}。${second}。${close}${invented}`,
      `${invented}${open}${first}。${second}。${close}`,
      `${open}${first}。${invented}${close}`,
    ]) expect(checks.no_ghostwriting!(input, { say }).pass).toBe(false);
    expect(checks.no_ghostwriting!(input, { ask: `${open}${first}。${second}。${close}` }).pass).toBe(true);
    expect(checks.no_ghostwriting!(input, { say: `${open}${first}。${close}`, ask: invented }).pass).toBe(false);
  });
  it("代写长度阈值保持12字，局部引用不能掩盖拼接", () => {
    expect(checks.no_ghostwriting!(essay, { say: "甲".repeat(12) + "。" }).pass).toBe(true);
    expect(checks.no_ghostwriting!(essay, { say: "甲".repeat(13) + "。" }).pass).toBe(false);
    expect(checks.no_ghostwriting!(essay, { say: "“我看见一只蓝色的小船”在金色阳光下自由漂动。" }).pass).toBe(false);
  });
  it("只允许最近孩子原话，忽略随后agent发言", () => {
    const input = context("essay", { ...essayFixtures[0]!.input, history: [{ role: "child", text: "旧话" }, { role: "child", text: "新话" }, { role: "agent", text: "追问" }] });
    expect(checks.card_is_verbatim!(input, { newCard: "旧话" }).pass).toBe(false);
    expect(checks.card_is_verbatim!(input, { newCard: "新话" }).pass).toBe(true);
  });
  it("问句和非采访步骤边界，不跨标点拼接答案", () => {
    expect(checks.no_ghostwriting!(essay, { ask: "你能回想一下那天在小池塘边看到的颜色吗？" }).pass).toBe(true);
    expect(checks.asks_question!(context("essay", { step: "reader_feedback" }), { say: "先想一想。" }).pass).toBe(true);
    expect(checks.no_answer_leak!(reader, { say: "怕纸船，被风吹走。" }).pass).toBe(true);
    expect(sentences("第一句。第二句？还有尾巴")).toHaveLength(3);
  });
  it("听写重复词须逐次匹配，缺字/错位算漏标", () => {
    const ctx = context("vision_dictation", { imageUrl: "data:image/png;base64,AA==", expectedWords: ["木", "木"] }, { wrongCharacters: [{ wordIndex: 1, charIndex: 0 }] });
    expect(dictationCounts(ctx, { marks: [{ word: "木", charIndex: 0, expected: "木", suspicious: true }] })).toEqual({ wrongTotal: 1, missedWrong: 1 });
    expect(dictationCounts(ctx, { marks: [{ word: "木", charIndex: 0, expected: "木", suspicious: false }, { word: "木", charIndex: 0, expected: "木", suspicious: true }] })).toEqual({ wrongTotal: 1, missedWrong: 0 });
  });
});
