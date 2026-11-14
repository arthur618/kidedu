import { seed, harness, successOutput } from "../helpers";
import { getPrisma } from "../../../src/db/client";
import { upsertLesson } from "../../../src/db/lesson";
import type { LlmRequest } from "../../../src/contracts/llm";
export const topic = "编造的一次散步";
export const essayText = "我在小路上看见了蓝伞。虚构尾段只在私有表保存，不应出现在公共包。";
export function essayModel(request: LlmRequest<unknown>): unknown {
  if (request.agent === "vision_homework") return { unsure: false, items: [{ text: topic, kind: "essay", supported: true }] };
  if (request.agent !== "essay") return successOutput(request);
  const input = JSON.parse(request.user) as { step: string; history: { role: string; text: string }[]; essayText: string | null };
  if (input.step === "reader_feedback") return { say: `我看见了：“${input.essayText!.slice(0, 10)}”`, ask: "我还想知道，当时你听到了什么？", newCard: null, next: "step_done" };
  const child = input.history.at(-1);
  return { say: "我听见了。", ask: "你听到了什么？", newCard: child?.role === "child" ? child.text : null, next: "step_done" };
}
export async function setup() {
  await seed(); await getPrisma().essayRuntime.deleteMany();
  await upsertLesson({ id: "c7-lesson", grade: 3, term: "upper", lessonNo: 1, title: "编造作文课", recognizeChars: [], writeChars: [], words: [], status: "approved" });
  const h = harness(); h.fake.setHandler(essayModel); return h;
}
export async function prepare() {
  const h = await setup(); const started = await h.start(); const id = started.sessionId!;
  const homework = await h.post("homework", { spokenText: topic }, id);
  const items = (homework.effects[0]!.data as { items: unknown[] }).items;
  const enter = (key = h.key()) => h.request("event", { type: "homework_confirmed", items }, id, key);
  const post = (body: unknown, key = h.key()) => h.handlers().post("essay", new Request("http://localhost", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(body) }), id);
  return { h, id, items, enter, post };
}
