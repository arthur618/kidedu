import { afterAll, beforeAll, expect, it } from "vitest";
import { database } from "../helpers";
import { getPrisma } from "../../../src/db/client";
import { upsertChildChar } from "../../../src/db/childChar";
import { loadSource, dayBounds, sessionMinutes, fingerprint } from "../../../src/nightly/source";
import { NightlyRunRequestSchema } from "../../../src/contracts/nightly";
import { child, session, outcome, reading, essay, item, request } from "./helpers";
let db: Awaited<ReturnType<typeof database>>;
beforeAll(async () => { db = await database(); }); afterAll(async () => { await db.cleanup(); });
it("固定日手工对账：实际错字/复习去重、裁日重叠合并47分钟、原确认清单、复述与作文仅完成来源", async () => {
  const id = await child();
  // 上海日从13日16:00Z开始。前一会话跨入本日20分30秒，与第二会话重叠10分30秒。
  const a = await session(id, "2026-11-13T15:50:00.000Z", "2026-11-13T16:20:30.000Z", { homework: [item] });
  const b = await session(id, "2026-11-13T16:10:00.000Z", "2026-11-13T16:40:10.000Z", { homework: [{ ...item, done: true }] });
  const c = await session(id, "2026-11-14T15:53:00.000Z", "2026-11-14T16:12:00.000Z", { homework: [{ ...item, text: "明日结束不纳入清单" }] });
  const open = await session(id, "2026-11-14T04:00:00.000Z", null);
  const old = await session(id, "2026-11-13T10:00:00.000Z", "2026-11-13T10:20:00.000Z", { coverage: false });
  await outcome(a, "山", "wrong", "2026-11-13T16:00:00.000Z");
  await outcome(a, "山", "correct", "2026-11-13T16:02:00.000Z");
  await outcome(b, "水", "correct", "2026-11-13T16:30:00.000Z", "review_2d");
  await outcome(b, "月", "wrong", "2026-11-13T16:31:00.000Z", "review_7d");
  await outcome(c, "日", "wrong", "2026-11-14T16:00:00.000Z"); // 本日闭开边界排除
  await outcome(old, "木", "correct", "2026-11-13T10:10:00.000Z");
  await reading(b, "2026-11-14T05:00:00.000Z"); await essay(b, "2026-11-14T05:02:00.000Z");
  await reading(a, "2026-11-14T04:00:00.000Z", "abandoned"); await essay(a, "2026-11-14T04:01:00.000Z", "feedback");
  await upsertChildChar({ childId: id, char: "假", kind: "write", stage: "mastered", correctStreak: 9, nextReviewOn: null, wrongCount: 7, lastSeenOn: "2026-11-14" });
  const source = await loadSource(NightlyRunRequestSchema.parse(request(id)));
  expect(source.facts).toMatchObject({ minutes: 47, learningCoverage: "complete", outcomeCount: 4, practicedChars: ["山", "月", "水"], reviewedChars: ["月", "水"], wrongChars: ["山", "月"], completedEssaySessionIds: [b.id] });
  expect(source.facts.sessionIds).toEqual([a.id, b.id, open.id, c.id]); expect(source.facts.finishedSessionIds).toEqual([a.id, b.id, c.id]); expect(source.facts.unfinishedSessionIds).toEqual([open.id]);
  expect(source.facts.homework).toEqual([{ sessionId: a.id, item }, { sessionId: b.id, item: { ...item, done: true } }]);
  expect(source.retells).toHaveLength(1); expect(source.retells[0]!.sessionId).toBe(b.id); expect(source.retells[0]!.input.question).not.toContain("运行时追问");
  expect(JSON.stringify(source)).not.toContain("编造作文正文"); expect(source.facts.practicedChars).not.toContain("假");
  const utc = await loadSource(NightlyRunRequestSchema.parse(request(id, "UTC")));
  expect(utc.facts.minutes).toBe(19); expect(utc.facts.outcomeCount).toBe(1); expect(utc.facts.wrongChars).toEqual(["日"]); expect(utc.facts.homework).toEqual([{ sessionId: c.id, item: { ...item, text: "明日结束不纳入清单" } }]);
});
it("覆盖区分旧明细缺失、局部流水、新会话完整零练习与无活动；不从今天进度反推历史", async () => {
  const id = await child();
  expect((await loadSource(NightlyRunRequestSchema.parse(request(id)))).facts).toMatchObject({ learningCoverage: "none", sessionIds: [], outcomeCount: 0 });
  const fresh = await session(id, "2026-11-14T02:00:00.000Z", "2026-11-14T02:01:00.000Z");
  const complete = await loadSource(NightlyRunRequestSchema.parse(request(id)));
  expect(complete.facts).toMatchObject({ learningCoverage: "complete", practicedChars: [], outcomeCount: 0 });
  const old = await session(id, "2026-11-14T03:00:00.000Z", "2026-11-14T03:01:00.000Z", { coverage: false });
  expect((await loadSource(NightlyRunRequestSchema.parse(request(id)))).facts.learningCoverage).toBe("partial");
  await outcome(old, "山", "correct", "2026-11-14T03:00:30.000Z");
  expect((await loadSource(NightlyRunRequestSchema.parse(request(id)))).facts.learningCoverage).toBe("partial");
  const id2 = await child(); const onlyOld = await session(id2, "2026-11-14T03:00:00.000Z", "2026-11-14T03:01:00.000Z", { coverage: false });
  expect((await loadSource(NightlyRunRequestSchema.parse(request(id2)))).facts.learningCoverage).toBe("none");
  await outcome(onlyOld, "水", "wrong", "2026-11-14T03:00:00.000Z"); expect((await loadSource(NightlyRunRequestSchema.parse(request(id2)))).facts.learningCoverage).toBe("partial");
  const hash = fingerprint(await loadSource(NightlyRunRequestSchema.parse(request(id))));
  await upsertChildChar({ childId: id, char: "山", kind: "write", stage: "mastered", correctStreak: 10, nextReviewOn: null, wrongCount: 22, lastSeenOn: "2026-11-15" });
  expect(fingerprint(await loadSource(NightlyRunRequestSchema.parse(request(id))))).toBe(hash);
  expect(fresh.childId).toBe(id);
});
it("真实日历、两时区闭开边界、未结束不猜时长，坏时间和负会话明确拒绝", async () => {
  expect(() => dayBounds({ date: "2026-02-29", timezone: "UTC" })).toThrow(); expect(() => dayBounds({ date: "2026-13-01", timezone: "UTC" })).toThrow();
  expect(dayBounds({ date: "2024-02-29", timezone: "UTC" }).end - dayBounds({ date: "2024-02-29", timezone: "Asia/Shanghai" }).end).toBe(8 * 60 * 60000);
  const id = await child(); const open = await session(id, "2026-11-14T02:00:00.000Z", null);
  expect(sessionMinutes([open], 0, Date.now())).toBe(0);
  expect(() => sessionMinutes([{ ...open, endedAt: "2026-11-14T01:00:00.000Z" }], 0, Date.now())).toThrow("会话时间来源无效");
  await getPrisma().session.update({ where: { id: open.id }, data: { endedAt: "坏时间" } });
  await expect(loadSource(NightlyRunRequestSchema.parse(request(id)))).rejects.toThrow();
});
it("完成复述需非空原话、当日completedAt与approved快照；同时间按sessionId稳定序，弃置/计划/作文不评分", async () => {
  const id = await child(); const a = await session(id, "2026-11-13T01:00:00.000Z", "2026-11-13T01:10:00.000Z");
  const b = await session(id, a.startedAt, a.endedAt); const c = await session(id, a.startedAt, a.endedAt); const d = await session(id, a.startedAt, a.endedAt);
  await reading(a, "2026-11-14T00:00:00.000Z"); await reading(b, "2026-11-14T00:00:00.000Z"); await reading(c, "2026-11-14T01:00:00.000Z", "complete", []); await reading(d, null, "answer"); await essay(d, "2026-11-14T01:00:00.000Z");
  const source = await loadSource(NightlyRunRequestSchema.parse(request(id)));
  expect(source.retells.map(r => r.sessionId)).toEqual([a.id, b.id].sort()); expect(source.facts.completedEssaySessionIds).toEqual([d.id]);
  expect(source.facts.minutes).toBe(0); expect(source.facts.homework).toEqual([]); expect(source.facts.sessionIds).not.toContain(c.id);
});
it("裁日合并也支持Unix纪元前的真实日历日，不以0时间戳充当初始区间", async () => {
  const id = await child(); const s = await session(id, "1969-12-31T01:00:00.000Z", "1969-12-31T01:12:30.000Z");
  const bounds = dayBounds({ date: "1969-12-31", timezone: "UTC" }); expect(sessionMinutes([s], bounds.start, bounds.end)).toBe(12);
});
