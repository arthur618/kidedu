import { afterAll, beforeAll, expect, it } from "vitest";
import { database, harness, seed } from "../helpers";
import { getPrisma, disconnectPrisma } from "../../../src/db/client";
import { testChild } from "../../../src/db/test-fixtures";
let db: Awaited<ReturnType<typeof database>>;
beforeAll(async () => { db = await database(); }); afterAll(async () => { await db.cleanup(); });
it("C7 start同事务coverage，实际persist_char追加；检查点重启与原ID重放不重复", async () => {
  await seed(); const h = harness(); const started = await h.start(); const id = started.sessionId!;
  const row = await getPrisma().sessionLearningCoverage.findUnique({ where: { sessionId: id } }); expect(row!.startedAt).toBe((await h.deps.getSession(id))!.startedAt);
  await h.event(id, { type: "homework_captured" }); await h.event(id, { type: "homework_confirmed", items: [] });
  let fail = true; h.deps.afterCheckpoint = async () => { if (fail) throw new Error("模拟转换后进程退出"); };
  const key = h.key(); await expect(h.event(id, { type: "recognize_result", char: "山", result: "wrong", mode: "self_report" }, key)).rejects.toThrow();
  const first = await getPrisma().learningOutcome.findMany({ where: { sessionId: id } }); expect(first).toHaveLength(1); expect(first[0]).toMatchObject({ childId: testChild.id, char: "山", stageBefore: "recognize", stageAfter: "understand", result: "wrong", commandKey: key });
  fail = false; await disconnectPrisma(); h.restart(); await h.event(id, { type: "recognize_result", char: "山", result: "wrong", mode: "self_report" }, key); await h.event(id, { type: "recognize_result", char: "山", result: "wrong", mode: "self_report" }, key);
  expect(await getPrisma().learningOutcome.findMany({ where: { sessionId: id } })).toEqual(first); expect((await h.deps.getChildChar(testChild.id, "山"))!.wrongCount).toBe(1);
  await expect(getPrisma().learningOutcome.update({ where: { id: first[0]!.id }, data: { stageAfter: "mastered" } })).rejects.toThrow();
  await expect(getPrisma().learningOutcome.delete({ where: { id: first[0]!.id } })).rejects.toThrow();
});
it("真实SQLite observer写入故障回滚ChildChar/Runtime/command转换，重启后原ID可继续", async () => {
  await seed(); const h = harness(); const id = (await h.start()).sessionId!; await h.event(id, { type: "homework_captured" }); await h.event(id, { type: "homework_confirmed", items: [] });
  const before = await h.deps.getSessionRuntime(id), chars = await h.deps.listChildChars(testChild.id); const key = h.key();
  await getPrisma().$executeRawUnsafe(`CREATE TRIGGER "nightly_test_observer_failure" BEFORE INSERT ON "LearningOutcome" BEGIN SELECT RAISE(ABORT, 'fake failure'); END;`);
  try { expect((await h.request("event", { type: "recognize_result", char: "山", result: "correct", mode: "self_report" }, id, key)).status).toBe(500); }
  finally { await getPrisma().$executeRawUnsafe(`DROP TRIGGER "nightly_test_observer_failure"`); }
  expect(await h.deps.getSessionRuntime(id)).toEqual(before); expect(await h.deps.listChildChars(testChild.id)).toEqual(chars); expect(await getPrisma().learningOutcome.count({ where: { sessionId: id } })).toBe(0);
  expect((await getPrisma().sessionCommand.findUnique({ where: { scope_key: { scope: `session:${id}`, key } } }))!.phase).toBe("prepared");
  await disconnectPrisma(); h.restart(); await h.event(id, { type: "recognize_result", char: "山", result: "correct", mode: "self_report" }, key); expect(await getPrisma().learningOutcome.count({ where: { sessionId: id } })).toBe(1);
});
it("coach自动六轮结束也经同一observer记录真实wrong，不因过滤effects漏流水", async () => {
  await seed(); const h = harness(); const id = await h.enterUnderstand();
  h.fake.setHandler(req => req.agent === "guard" ? { verdict: "pass", reason: "none" } : { say: "看看字卡。", ask: "你能组一个书上的词吗？", next: "wait_child", usedCardFields: ["words"] });
  for (let i = 0; i < 6; i++) await h.post("coach", { char: "山", text: `编造回答${i}` }, id);
  const events = await getPrisma().learningOutcome.findMany({ where: { sessionId: id, char: "山" }, orderBy: { occurredAt: "asc" } });
  expect(events).toHaveLength(2); expect(events.some(e => e.stageBefore === "understand" && e.stageAfter === "understand" && e.result === "wrong")).toBe(true);
});
it("start coverage写入失败整个新会话与command一起回滚", async () => {
  await seed(); const h = harness(); const before = await getPrisma().session.count();
  await getPrisma().$executeRawUnsafe(`CREATE TRIGGER "nightly_test_coverage_failure" BEFORE INSERT ON "SessionLearningCoverage" BEGIN SELECT RAISE(ABORT, 'fake failure'); END;`);
  try { expect((await h.request("start", { childId: testChild.id, lessonId: "c7-lesson", hasEssayToday: false })).status).toBe(500); }
  finally { await getPrisma().$executeRawUnsafe(`DROP TRIGGER "nightly_test_coverage_failure"`); }
  expect(await getPrisma().session.count()).toBe(before); expect(await getPrisma().sessionCommand.count()).toBe(0); expect(await getPrisma().sessionRuntime.count()).toBe(0);
});
