import type { AdvanceChar, PlanDay } from "../contracts/orchestrator";
import { addDays } from "./dates";

export const advanceChar: AdvanceChar = (cc, result, today) => {
  const next = { ...cc, lastSeenOn: today };
  // 已掌握的学习进度冻结，但每次重逢仍记录日期。
  if (cc.stage === "mastered") return next;

  if (result === "wrong") {
    next.wrongCount += 1;
    if (cc.stage === "write" || cc.stage === "review_2d" || cc.stage === "review_7d") {
      next.stage = "understand";
      next.nextReviewOn = null;
    }
    if (cc.stage === "review_2d" || cc.stage === "review_7d") next.correctStreak = 0;
    return next;
  }

  next.correctStreak += 1;
  switch (cc.stage) {
    case "recognize":
      next.stage = "understand";
      next.nextReviewOn = null;
      break;
    case "understand":
      next.stage = cc.kind === "write" ? "write" : "review_2d";
      next.nextReviewOn = cc.kind === "write" ? null : addDays(today, 2);
      break;
    case "write":
      next.stage = "review_2d";
      next.nextReviewOn = addDays(today, 2);
      break;
    case "review_2d":
      next.stage = "review_7d";
      next.nextReviewOn = addDays(today, 7);
      break;
    case "review_7d":
      next.stage = "mastered";
      next.nextReviewOn = null;
      break;
  }
  return next;
};

function compareCodePoints(left: string, right: string): number {
  return (left.codePointAt(0) ?? 0) - (right.codePointAt(0) ?? 0);
}

export const planDay: PlanDay = (all, lessonChars, today) => {
  const known = new Map(all.map((cc) => [cc.char, cc]));
  return {
    newChars: [...new Set(lessonChars
      .filter(({ char }) => !known.has(char) || known.get(char)?.stage === "recognize")
      .map(({ char }) => char))],
    reviewChars: all
      .filter((cc) => (cc.stage === "review_2d" || cc.stage === "review_7d")
        && cc.nextReviewOn !== null && cc.nextReviewOn <= today)
      .slice()
      .sort((a, b) => b.wrongCount - a.wrongCount || compareCodePoints(a.char, b.char))
      .slice(0, 12)
      .map((cc) => cc.char),
  };
};
