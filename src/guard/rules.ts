import type { GuardInput, GuardOutput } from "../contracts/schemas";
import { SENSITIVE_WORDS } from "./wordlist";

export interface GuardExtra {
  usedCardFields?: string[];
  childLastUtterance?: string;
  keyPoints?: string[];
}

export type RuleResult =
  | { verdict: "pass" }
  | { verdict: "blocked"; reason: Exclude<GuardOutput["reason"], "none"> }
  | { verdict: "unsure" };

function compact(text: string): string {
  return text.replace(/\s/gu, "");
}

function sentences(text: string): string[] {
  return (text.match(/[^。！？!?]+[。！？!?]*/gu) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function sentenceLength(sentence: string): number {
  return Array.from(compact(sentence).replace(/[。！？!?]+$/u, "")).length;
}

function isQuestion(sentence: string): boolean {
  return /？$/u.test(sentence) || /[吗呢][。！？!?]+$/u.test(sentence);
}

function withoutChildQuotes(text: string, childLastUtterance: string): string {
  const removeQuote = (quote: string, content: string): string =>
    childLastUtterance.includes(content) ? "" : quote;
  return text.replace(/“([^“”]*)”/gu, removeQuote).replace(/‘([^‘’]*)’/gu, removeQuote);
}

export function checkRules(input: GuardInput, extra: GuardExtra = {}): RuleResult {
  const { candidate, agent, context } = input;
  // 顺序就是优先级；不能为了后面的特例跳过前面的规则。
  if (SENSITIVE_WORDS.some((word) => candidate.includes(word))) {
    return { verdict: "blocked", reason: "unsafe" };
  }
  const allSentences = sentences(candidate);
  if (Array.from(compact(candidate)).length > 140 || allSentences.length > 3) {
    return { verdict: "blocked", reason: "too_long" };
  }
  if (context === "char" && agent === "char_coach" && !extra.usedCardFields?.length) {
    return { verdict: "blocked", reason: "no_card_reference" };
  }
  if (context === "essay" && ["你可以写", "可以这样写", "比如写", "开头可以", "结尾可以", "好词", "好句"]
    .some((phrase) => candidate.includes(phrase))) {
    return { verdict: "blocked", reason: "ghostwriting" };
  }
  const childText = extra.childLastUtterance ?? "";
  if (context === "essay" && sentences(withoutChildQuotes(candidate, childText)).some((sentence) =>
    sentenceLength(sentence) > 12 && !isQuestion(sentence)
      && !childText.includes(sentence.replace(/[。！？!?]+$/u, "")))) {
    return { verdict: "unsure" };
  }
  if (context === "reading" && (extra.keyPoints ?? []).some((point) => {
    const chars = Array.from(point);
    return chars.some((_, index) => index + 6 <= chars.length
      && candidate.includes(chars.slice(index, index + 6).join("")));
  })) {
    return { verdict: "blocked", reason: "answer_leak" };
  }
  if (context === "reading" && allSentences.some((sentence) => sentenceLength(sentence) > 20 && !isQuestion(sentence))) {
    return { verdict: "unsure" };
  }
  return { verdict: "pass" };
}
