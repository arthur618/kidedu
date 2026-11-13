import { EssayInput, type EssayOutput } from "../../contracts/schemas";

const questions = ["你看到了什么？", "你听到了什么？", "当时说了什么？", "当时你是怎么想的？", "后来发生了什么？"] as const;
export function fallback(input: unknown): EssayOutput {
  const parsed = EssayInput.safeParse(input);
  if (parsed.success && parsed.data.step === "reader_feedback") {
    // 只引用输入中的原文，不生成作文。没有正文时不假装读过。
    const text = parsed.data.essayText;
    const quote = text?.match(/^[^。！？!?\n]+/)?.[0].slice(0, 24);
    return quote ? { say: `我看见了：“${quote}”`, ask: "我还想知道，当时你是怎么想的？", next: "wait_child", newCard: null }
      : { say: "我们先找个细节。", ask: "你想先聊哪一处？", next: "wait_child", newCard: null };
  }
  const index = parsed.success ? parsed.data.cards.length % questions.length : 0;
  return { say: "先想一个小细节。", ask: questions[index] ?? questions[0], next: "wait_child", newCard: null };
}
