import { expect, it } from "vitest";
import { addDays } from "./dates";
import { advanceChar } from "./schedule";
import type { ChildChar } from "../contracts/schemas";

it.each([
  ["2026-11-29", 2, "2026-12-01"], ["2026-12-28", 7, "2027-01-04"],
  ["2024-02-28", 2, "2024-03-01"], ["2026-02-28", 1, "2026-03-01"],
  ["2027-01-01", -1, "2026-12-31"], ["2026-11-29", 0, "2026-11-29"],
  ["0099-12-31", 1, "0100-01-01"],
])("[3] 按日历日计算%s加%s天得到%s", (day, count, expected) => {
  expect(addDays(day, count)).toBe(expected);
});

it("[3] 七天复习排期跨年", () => {
  const cc: ChildChar = {
    childId: "fictional-child", char: "木", kind: "write", stage: "review_2d", correctStreak: 0,
    nextReviewOn: "2026-12-28", wrongCount: 0, lastSeenOn: null,
  };
  expect(advanceChar(cc, "correct", "2026-12-28").nextReviewOn).toBe("2027-01-04");
});

it.each(["2026-02-30", "2026-13-01", "2026-1-01", "任意文字"])("[3] 拒绝不合法的日历日期%s", (day) => {
  expect(() => addDays(day, 1)).toThrow();
});

it("[3] 不接受非整数天数，越出四位年份格式也不静默截断", () => {
  expect(() => addDays("2026-11-29", 0.5)).toThrow();
  expect(() => addDays("9999-12-31", 1)).toThrow();
});
