import { harness, seed } from "../helpers";
import { upsertPassage } from "../../../src/db/passage";
import { getPrisma } from "../../../src/db/client";
import { testPassage } from "../../../src/db/test-fixtures";
export const canary = "只供服务端参考的秘密长标记红色松鼠藏在远处树洞里面";
export const passage = { ...testPassage, id: "c9-story", title: "编造的小山", body: "山边有水。小鸟飞过山坡。", targetChars: ["山", "山", "水"], question: "你想说说哪一段？", keyPoints: [canary] };
export async function prepare() {
  await seed(); await getPrisma().readingRuntime.deleteMany(); await getPrisma().passage.deleteMany(); await upsertPassage(passage);
  const h = harness(); const packet = await h.start(); const id = packet.sessionId!;
  const runtime = (await h.deps.getSessionRuntime(id))!;
  const context = { ...runtime.context, elapsedMinutes: 7, understandAttempts: { 山: 2 }, queue: ["山"], homework: [{ id: "fictional", text: "自己的清单", kind: "other" as const, supported: false, done: true }] };
  await h.deps.saveSessionRuntime({ ...runtime, state: "reading_offer", context });
  h.fake.setHandler(request => request.agent === "guard" ? { verdict: "pass", reason: "none" } : { say: "我听见了。", ask: "你从哪里看出来的？", next: "wait_child" });
  const post = (text: string, key = h.key()) => h.handlers().post("reading", new Request("http://localhost", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({ text }) }), id);
  return { h, id, context, post };
}
