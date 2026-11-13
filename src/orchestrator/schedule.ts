import type { AdvanceChar, NextStage, PlanDay } from "../contracts/orchestrator";
import type { ChildChar } from "../contracts/schemas";
import { addDays } from "./dates";

export const nextStage: NextStage = (stage, kind, result) => {
  if (stage === "mastered") return "mastered";
  if (result === "wrong") return "understand";
  switch (stage) {
    case "recognize": return "understand";
    case "understand": return kind === "write" ? "write" : "review_2d";
    case "write": return "review_2d";
    case "review_2d": return "review_7d";
    case "review_7d": return "mastered";
  }
};

export const advanceChar: AdvanceChar = (cc, result, today) => {
  // 已掌握的学习进度冻结，但每次重逢仍记录日期。
  if (cc.stage === "mastered") return { ...cc, lastSeenOn: today };
  const stage = nextStage(cc.stage, cc.kind, result);
  const reviewWrong = result === "wrong" && (cc.stage === "review_2d" || cc.stage === "review_7d");
  return {
    ...cc,
    stage,
    correctStreak: result === "correct" ? cc.correctStreak + 1 : reviewWrong ? 0 : cc.correctStreak,
    wrongCount: cc.wrongCount + (result === "wrong" ? 1 : 0),
    nextReviewOn: stage === "review_2d" ? addDays(today, 2) : stage === "review_7d" ? addDays(today, 7) : null,
    lastSeenOn: today,
  };
};

function rankedChars(records: ChildChar[], limit: number): string[] {
  return [...records]
    .sort((a, b) => b.wrongCount - a.wrongCount || (a.char.codePointAt(0) ?? 0) - (b.char.codePointAt(0) ?? 0))
    .slice(0, limit)
    .map(({ char }) => char);
}

export const planDay: PlanDay = (all, lessonChars, today) => {
  const known = new Map(all.map((cc) => [cc.char, cc]));
  const newChars = [...new Set(lessonChars
    .filter(({ char }) => !known.has(char) || known.get(char)?.stage === "recognize")
    .map(({ char }) => char))];
  const newSet = new Set(newChars);
  return {
    newChars,
    reviewChars: rankedChars(all.filter((cc) => (cc.stage === "review_2d" || cc.stage === "review_7d")
      && cc.nextReviewOn !== null && cc.nextReviewOn <= today), 12),
    carryOverChars: rankedChars(all.filter((cc) => (cc.stage === "understand" || cc.stage === "write")
      && !newSet.has(cc.char)), 8),
  };
};
