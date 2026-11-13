import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
import { SessionPacketSchema } from "../../src/contracts/session";
import { decodeScreen } from "../../src/ui/model";
import { getSessionRuntime } from "../../src/db/sessionRuntime";
import { getCoachRuntime } from "../../src/db/coachRuntime";
import { listChildChars } from "../../src/db/childChar";
import { testChild } from "../../src/db/test-fixtures";
import { database, seed, harness, photo, photo2 } from "./helpers";
let db: Awaited<ReturnType<typeof database>>;
beforeAll(async () => { db = await database(); }, 60000); beforeEach(seed); afterAll(async () => { await db.cleanup(); });
async function interruptedPhoto() {
  const h = harness(); const id = await h.enterUnderstand(); await h.coachAll(id); await h.event(id, { type: "dictation_played" });
  const a = { key: h.key(), body: { type: "dictation_photo", imageUrl: photo } };
  h.deps.afterCheckpoint = async () => { throw new Error("fictional_photo_checkpoint_failure"); };
  expect((await h.request("event", a.body, id, a.key)).status).toBe(500); h.restart();
  const b = { key: h.key(), body: { type: "dictation_photo", imageUrl: photo2 } };
  expect((await h.event(id, b.body, b.key)).unavailable?.reason).toBe("photo_not_available");
  return { h, id, a, b };
}
async function progress(id: string) { return { runtime: await getSessionRuntime(id), coach: await getCoachRuntime(id), chars: await listChildChars(testChild.id) }; }
async function read(h: ReturnType<typeof harness>, id: string) {
  const response = await h.handlers().get(id); expect(response.status).toBe(200);
  const packet = SessionPacketSchema.parse(await response.json()); decodeScreen(packet); return packet;
}
it("F1 [18][19][20][21] A检查点故障→重启→非法B→恢复A→GET与B重放始终合法且不串照片", async () => {
  const { h, id, a, b } = await interruptedPhoto(); const before = await progress(id);
  const recovered = await h.event(id, a.body, a.key); expect((recovered.effects[0]?.data as { imageUrl: string }).imageUrl).toBe(photo);
  const calls = h.fake.calls.length; const current = await read(h, id);
  expect(current.unavailable).toBeUndefined(); expect((current.effects[0]?.data as { imageUrl: string }).imageUrl).toBe(photo);
  const replayB = await h.event(id, b.body, b.key); expect(replayB.unavailable?.reason).toBe("photo_not_available");
  expect(JSON.stringify(replayB)).not.toContain(photo2); expect(h.fake.calls.length).toBe(calls);
  expect(await progress(id)).toEqual(before); expect(await read(h, id)).toEqual(current);
  // 同正文的新ID也不能遮蔽原命令的当前可用快照。
  await h.event(id, a.body); expect(await read(h, id)).toEqual(current);
});
for (const recovered of [false, true]) for (const ended of [false, true]) it(`F1 [18][19][20][21] ${recovered ? "恢复后" : "恢复前"}退出到${ended ? "ended" : "wrap_up"}，旧A重放只读合法历史结果`, async () => {
  const { h, id, a, b } = await interruptedPhoto();
  if (recovered) await h.event(id, a.body, a.key);
  await h.event(id, { type: "quit" }); if (ended) await h.event(id, { type: "quit" });
  const before = await progress(id); const calls = h.fake.calls.length;
  for (let i = 0; i < 2; i++) {
    const replay = await h.event(id, a.body, a.key); expect(replay.state).toBe("dictation_compare");
    if (!recovered) expect(replay.unavailable?.reason).toBe("photo_not_available");
    await h.event(id, b.body, b.key);
  }
  expect(h.fake.calls.length).toBe(calls); expect(await progress(id)).toEqual(before);
  const current = await read(h, id); expect(current.state).toBe(ended ? "ended" : "wrap_up");
  expect(current.effects.every(effect => effect.screen === current.state)).toBe(true);
});
