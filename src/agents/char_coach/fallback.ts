import { CharCoachInput, type CharCoachOutput } from "../../contracts/schemas";
import { cardExcerpt } from "../shared";

export function fallback(input: unknown): CharCoachOutput {
  const card = CharCoachInput.pick({ card: true }).safeParse(input);
  if (!card.success) return { say: "这个我还不知道，我记下来了", ask: null, next: "escalate", usedCardFields: [] };
  const parsed = CharCoachInput.safeParse(input);
  const step = parsed.success ? parsed.data.step : "explain";
  if (step === "make_word") return {
    say: `想想以“${card.data.card.words[0]?.slice(0, 1) ?? ""}”开头的词。`,
    ask: "你能用这个字组一个书上的词吗？", next: "wait_child", usedCardFields: ["words"],
  };
  if (step === "make_sentence") return {
    say: "选字卡里的一个词。", ask: "你能用它说一句话吗？", next: "wait_child", usedCardFields: ["words"],
  };
  return { say: cardExcerpt(card.data.card.explain), ask: null, next: "wait_child", usedCardFields: ["explain"] };
}
