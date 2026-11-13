import { ReaderInput, type ReaderOutput } from "../../contracts/schemas";

export function fallback(input: unknown): ReaderOutput {
  const parsed = ReaderInput.safeParse(input);
  if (!parsed.success) return { say: "我们再看一遍短文。", ask: "你想从哪里开始读？", next: "wait_child" };
  const { step, passage } = parsed.data;
  if (step === "wrap_up") return { say: "这次先读到这里。", ask: null, next: "step_done" };
  if (step === "follow_up") return { say: "再想一想。", ask: "你从哪里看出来的？", next: "wait_child" };
  const question = passage.question;
  const sentences = question.match(/[^。！？!?]+[。！？!?]?/g) ?? [];
  return { say: "读完想一想。", ask: question.length > 0 && question.length <= 60 && sentences.length <= 1 ? question : "读完短文，你想说什么？", next: "wait_child" };
}
