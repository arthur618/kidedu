import { describe, expect, it } from "vitest";
import { CharKind, CharStage, ChildChar } from "../contracts/schemas";
import { advanceChar, nextStage, planDay } from "./schedule";

const today = "2026-11-29";
function record(overrides: Partial<ChildChar> = {}): ChildChar {
  return ChildChar.parse({
    childId: "fictional-child", char: "休", kind: "write", stage: "recognize",
    correctStreak: 3, nextReviewOn: null, wrongCount: 2, lastSeenOn: "2026-11-20", ...overrides,
  });
}

describe("间隔复习", () => {
  it.each([
    ["recognize", "understand", null],
    ["understand", "write", null],
    ["write", "review_2d", "2026-12-01"],
    ["review_2d", "review_7d", "2026-12-06"],
    ["review_7d", "mastered", null],
  ] as const)("[1] 规则1–5 %s答对 → %s；规则7连续答对数加一且更新日期", (stage, expectedStage, due) => {
    const input = record({ stage, nextReviewOn: stage.startsWith("review") ? today : null });
    expect(advanceChar(input, "correct", today)).toEqual({
      ...input, stage: expectedStage, correctStreak: 4, nextReviewOn: due, lastSeenOn: today,
    });
  });

  it.each([
    ["recognize", "understand", 3], ["understand", "understand", 3],
    ["write", "understand", 3], ["review_2d", "understand", 0], ["review_7d", "understand", 0],
  ] as const)("[1] 规则1–5 %s答错 → %s；规则7更新日期而不增加连续数", (stage, expectedStage, streak) => {
    const input = record({ stage, nextReviewOn: stage.startsWith("review") ? today : null });
    expect(advanceChar(input, "wrong", today)).toEqual({
      ...input, stage: expectedStage, correctStreak: streak, wrongCount: 3, nextReviewOn: null, lastSeenOn: today,
    });
  });

  it.each(["correct", "wrong"] as const)("[1] 规则6 mastered遇到%s只记录重逢日期，学习进度不变", (result) => {
    const input = record({ stage: "mastered" });
    const output = advanceChar(input, result, today);
    expect(output).toEqual({ ...input, lastSeenOn: today });
    expect(output).not.toBe(input);
  });

  it("[2] 会认字理解答对直接排两天后的复习，不进入write", () => {
    const input = record({ stage: "understand", kind: "recognize_only" });
    expect(advanceChar(input, "correct", today)).toEqual({
      ...input, stage: "review_2d", nextReviewOn: "2026-12-01", correctStreak: 4, lastSeenOn: today,
    });
  });

  it.each(["recognize", "understand", "write", "review_2d", "review_7d", "mastered"] as const)(
    "[4] %s的冻结入参在答对和答错后均不被修改", (stage) => {
      const input = Object.freeze(record({ stage }));
      const snapshot = { ...input };
      for (const result of ["correct", "wrong"] as const) {
        const output = advanceChar(input, result, today);
        expect(input).toEqual(snapshot);
        expect(output).not.toBe(input);
        expect(ChildChar.safeParse(output).success).toBe(true);
      }
    },
  );

  it("[5] 只选到期、过期的复习阶段字，不对过期字增加惩罚", () => {
    const all = [
      record({ char: "一", stage: "review_2d", nextReviewOn: today }),
      record({ char: "二", stage: "review_7d", nextReviewOn: "2026-11-01" }),
      record({ char: "三", stage: "review_2d", nextReviewOn: "2026-11-30" }),
      record({ char: "四", stage: "review_7d", nextReviewOn: null }),
      record({ char: "五", stage: "mastered", nextReviewOn: "2026-11-01" }),
      record({ char: "六", stage: "understand", nextReviewOn: "2026-11-01" }),
    ];
    const snapshot = structuredClone(all);
    all.forEach(Object.freeze);
    Object.freeze(all);
    expect(planDay(all, [], today).reviewChars).toEqual(["一", "二"]);
    expect(all).toEqual(snapshot);
  });

  it("[5] 超过12字按错题数降序、Unicode码点升序截取，输入顺序不影响结果", () => {
    const all = Array.from({ length: 18 }, (_, index) => record({
      char: String.fromCodePoint(0x4e00 + index), stage: index % 2 === 0 ? "review_2d" : "review_7d",
      nextReviewOn: today, wrongCount: index < 3 ? 9 : 4,
    }));
    const expected = Array.from({ length: 12 }, (_, index) => String.fromCodePoint(0x4e00 + index));
    expect(planDay(all, [], today).reviewChars).toEqual(expected);
    expect(planDay([...all].reverse(), [], today).reviewChars).toEqual(expected);
    expect(planDay([...all.slice(7), ...all.slice(0, 7)], [], today).reviewChars).toEqual(expected);
  });

  it("[6] 课内只保留未见过或仍在recognize的新字，不限制数量并去重", () => {
    const stages: CharStage[] = ["recognize", "understand", "write", "review_2d", "review_7d", "mastered"];
    const all = stages.map((stage, index) => record({ char: String.fromCodePoint(0x4e00 + index), stage }));
    const lesson = Array.from({ length: 30 }, (_, index) => ({ char: String.fromCodePoint(0x4e00 + index), kind: "write" as const }));
    const snapshot = structuredClone(lesson);
    lesson.forEach(Object.freeze);
    Object.freeze(lesson);
    expect(planDay(all, lesson, today).newChars).toEqual([lesson[0]!.char, ...lesson.slice(6).map(({ char }) => char)]);
    expect(planDay(all, [...lesson, lesson[0]!], today).newChars).toHaveLength(25);
    expect(lesson).toEqual(snapshot);
  });

  for (const stage of CharStage.options) {
    for (const kind of CharKind.options) {
      for (const result of ["correct", "wrong"] as const) {
        it(`[17] nextStage与advanceChar一致：${stage} × ${kind} × ${result}`, () => {
          const input = Object.freeze(record({ stage, kind, nextReviewOn: stage.startsWith("review") ? today : null }));
          const output = advanceChar(input, result, today);
          expect(output.stage).toBe(nextStage(stage, kind, result));
          expect(ChildChar.safeParse(output).success).toBe(true);
        });
      }
    }
  }

  it.each([
    ["review_2d", "wrong"], ["review_7d", "correct"], ["review_7d", "wrong"],
  ] as const)("[1] 规则8 离开%s且不进入复习阶段时清空排期：%s", (stage, result) => {
    expect(advanceChar(record({ stage, nextReviewOn: today }), result, today).nextReviewOn).toBeNull();
  });

  it("[24] understand和write都是遗留字；课内已有遗留字不再作为新字或复习字", () => {
    const all = [record({ char: "休", stage: "understand" }), record({ char: "林", stage: "write" }),
      record({ char: "木", stage: "recognize" }), record({ char: "明", stage: "mastered" })];
    const plan = planDay(all, [
      { char: "休", kind: "write" }, { char: "林", kind: "write" }, { char: "木", kind: "recognize_only" },
      { char: "禾", kind: "recognize_only" }, { char: "禾", kind: "recognize_only" },
    ], today);
    expect(plan).toEqual({ newChars: ["木", "禾"], reviewChars: [], carryOverChars: ["休", "林"] });
    expect(new Set([...plan.newChars, ...plan.reviewChars, ...plan.carryOverChars]).size).toBe(4);
  });

  it("[24] 遗留字超过8个时按错误数降序、码点升序取前8，冻结输入和改变输入顺序都不影响结果", () => {
    const all = Array.from({ length: 12 }, (_, index) => record({
      char: String.fromCodePoint(0x4e00 + index), stage: index % 2 === 0 ? "understand" : "write",
      wrongCount: index < 3 ? 8 : 2,
    }));
    const snapshot = structuredClone(all);
    all.forEach(Object.freeze);
    Object.freeze(all);
    const expected = Array.from({ length: 8 }, (_, index) => String.fromCodePoint(0x4e00 + index));
    expect(planDay(all, [], today).carryOverChars).toEqual(expected);
    expect(planDay([...all].reverse(), [], today).carryOverChars).toEqual(expected);
    expect(planDay([...all.slice(5), ...all.slice(0, 5)], [], today).carryOverChars).toEqual(expected);
    expect(all).toEqual(snapshot);
  });
});
