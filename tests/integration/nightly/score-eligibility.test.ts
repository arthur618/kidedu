import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { database } from "../helpers";
import { getPrisma, disconnectPrisma } from "../../../src/db/client";
import { getDailyReport } from "../../../src/db/nightly/store";
import { createNightlyRunner } from "../../../src/nightly/run";
import { loadSource, fingerprint } from "../../../src/nightly/source";
import { NightlyRunRequestSchema } from "../../../src/contracts/nightly";
import { factualFallback } from "../../../src/nightly/agents";
import { child, session, outcome, reading, request, fakeModel, moment, question, keyPoint, transcript } from "./helpers";
let db: Awaited<ReturnType<typeof database>>;
beforeAll(async () => { db = await database(); }); afterAll(async () => { await db.cleanup(); });
const now = () => new Date(moment);
async function fixture() {
  const id = await child(); const s = await session(id, "2026-11-14T02:00:00.000Z", "2026-11-14T02:20:00.000Z");
  await reading(s, "2026-11-14T02:15:00.000Z"); return { id, s };
}
async function edit(sessionId: string, change: (raw: Record<string, any>) => void) {
  const row = await getPrisma().readingRuntime.findUniqueOrThrow({ where: { sessionId } });
  const raw = JSON.parse(row.data); change(raw);
  await getPrisma().readingRuntime.update({ where: { sessionId }, data: { data: JSON.stringify(raw) } });
}
const cases: [string, (raw: Record<string, any>) => void, string][] = [
  ["安全模板替换", raw => { raw.question = "说说你想到的事？"; }, "question_mismatch"],
  ["不同首问", raw => { raw.question = question + "？"; }, "question_mismatch"],
  ["空首问", raw => { raw.question = ""; }, "missing_question"],
  ["空白首问", raw => { raw.question = " \n "; }, "missing_question"],
  ["未知首问", raw => { raw.question = null; }, "missing_question"],
  ["历史缺首问", raw => { delete raw.question; }, "missing_question"],
  ["无参考要点", raw => { raw.passage.keyPoints = []; }, "missing_key_points"],
  ["含空白参考项", raw => { raw.passage.keyPoints = [keyPoint, " \n "]; }, "missing_key_points"],
  ["空参考项", raw => { raw.passage.keyPoints = [""]; }, "missing_key_points"],
  ["空完成原话", raw => { raw.transcript = []; }, "missing_transcript"],
  ["空白完成原话", raw => { raw.transcript = [" \n "]; }, "missing_transcript"],
];
it.each(cases)("%s保持完成事实但null且零score调用/Step/Turn；公有与日志无私有标记", async (_, change, reason) => {
  const { id, s } = await fixture(); await edit(s.id, change);
  const log = vi.spyOn(console, "log"), error = vi.spyOn(console, "error");
  try {
    const source = await loadSource(NightlyRunRequestSchema.parse(request(id)));
    expect(source.scoringPolicyVersion).toBe(2);
    expect(source.retells).toEqual([{ sessionId: s.id, completedAt: "2026-11-14T02:15:00.000Z", eligible: false, reason }]);
    for (const marker of [question, keyPoint, ...transcript]) expect(JSON.stringify(source)).not.toContain(marker);
    const fake = fakeModel(); const run = createNightlyRunner({ llm: fake.llm, now });
    const report = await run(request(id)); expect(report.retellScores).toEqual([{ sessionId: s.id, completedAt: "2026-11-14T02:15:00.000Z", status: "unavailable", result: null }]);
    expect(report.facts).toMatchObject({ sessionIds: [s.id], finishedSessionIds: [s.id], minutes: 20, outcomeCount: 0 });
    expect(JSON.parse(fake.calls[0]!.user).retellScore).toBeNull();
    await run(request(id)); await run({ ...request(id), retryFailed: true });
    expect(fake.calls.filter(call => call.agent === "score")).toHaveLength(0);
    expect(await getPrisma().nightlyStep.count({ where: { jobId: Number(report.id.slice(6)), key: { startsWith: "score:" } } })).toBe(0);
    const turns = await getPrisma().turn.findMany({ where: { sessionId: s.id } }); expect(turns.every(turn => turn.agent === "report")).toBe(true);
    for (const marker of [question, keyPoint, ...transcript, reason, "scoringPolicyVersion", "eligible"]) expect(JSON.stringify([report, turns, log.mock.calls, error.mock.calls])).not.toContain(marker);
  } finally { log.mockRestore(); error.mockRestore(); }
});
it("首问逐字相同且参考/原话有效才评分，真实0保留", async () => {
  const { id, s } = await fixture(); const fake = fakeModel();
  const source = await loadSource(NightlyRunRequestSchema.parse(request(id)));
  expect(source.retells[0]).toMatchObject({ eligible: true, input: { question, keyPoints: [keyPoint], transcript: transcript.join("\n") } });
  const report = await createNightlyRunner({ llm: fake.llm, now })(request(id));
  expect(report.retellScores[0]).toMatchObject({ status: "scored", result: { score: 0 } }); expect(JSON.parse(fake.calls.at(-1)!.user).retellScore).toBe(0);
  expect(fake.calls.map(call => call.agent)).toEqual(["score", "report"]);
  expect(await getPrisma().turn.count({ where: { sessionId: s.id, agent: "score" } })).toBe(1);
});
/** 构造原策略历史行；不借生产开关绕过资格。 */
async function legacyJob(id: string, report: Awaited<ReturnType<ReturnType<typeof createNightlyRunner>>>, reportInput: unknown) {
  const jobId = Number(report.id.slice(6));
  const snapshot: any = await loadSource(NightlyRunRequestSchema.parse(request(id)));
  delete snapshot.scoringPolicyVersion;
  for (const retell of snapshot.retells) { delete retell.eligible; delete retell.reason; }
  const sourceVersion = fingerprint(snapshot);
  await getPrisma().nightlyJob.update({ where: { id: jobId }, data: { sourceVersion, snapshot: JSON.stringify(snapshot), final: JSON.stringify({ ...report, sourceVersion }) } });
  await getPrisma().nightlyPublication.update({ where: { childId_date_timezone: { childId: id, date: "2026-11-14", timezone: "Asia/Shanghai" } }, data: { data: JSON.stringify({ ...report, sourceVersion }) } });
  const step = await getPrisma().nightlyStep.findFirstOrThrow({ where: { jobId, key: "report" } });
  await getPrisma().nightlyStep.update({ where: { jobId_key_inputFingerprint: { jobId, key: "report", inputFingerprint: step.inputFingerprint } }, data: { inputFingerprint: fingerprint(reportInput) } });
  return sourceVersion;
}
it("历史成功final/step遇实际首问变更后发布null，默认及retry不再调用score或借旧分", async () => {
  const { id, s } = await fixture(); const fake = fakeModel(req => req.agent === "score" ? { score: 3, reason: "编造私有理由" } : factualFallback(JSON.parse(req.user)));
  const run = createNightlyRunner({ llm: fake.llm, now }); const old = await run(request(id));
  const oldVersion = await legacyJob(id, old, JSON.parse(fake.calls.at(-1)!.user));
  await edit(s.id, raw => { raw.question = "受信模板首问？"; });
  const current = await run(request(id)); expect(current.sourceVersion).not.toBe(oldVersion); expect(current.sourceVersion).not.toBe(old.sourceVersion);
  expect(current.retellScores[0]!.result).toBeNull(); expect(JSON.parse(fake.calls.at(-1)!.user).retellScore).toBeNull();
  expect(await getDailyReport(id, "2026-11-14", "Asia/Shanghai")).toEqual(current);
  await disconnectPrisma(); await run(request(id)); await run({ ...request(id), retryFailed: true }); await run({ ...request(id), retryFailed: true });
  expect(fake.calls.filter(call => call.agent === "score")).toHaveLength(1);
  expect(await getPrisma().nightlyStep.count({ where: { jobId: Number(current.id.slice(6)), key: { startsWith: "score:" } } })).toBe(0);
});
it("最新不合格完成复述不能回退早先成功分数；跨孩子不借分", async () => {
  const { id, s } = await fixture(); const latest = await session(id, "2026-11-14T03:00:00.000Z", "2026-11-14T03:20:00.000Z"); await reading(latest, "2026-11-14T03:15:00.000Z"); await edit(latest.id, raw => { raw.transcript = []; });
  const other = await child(); const otherSession = await session(other, s.startedAt, s.endedAt); await reading(otherSession, "2026-11-14T02:15:00.000Z");
  const fake = fakeModel(req => req.agent === "score" ? { score: 2, reason: "参考" } : factualFallback(JSON.parse(req.user))); const run = createNightlyRunner({ llm: fake.llm, now });
  const report = await run(request(id)); expect(report.retellScores.map(item => item.result?.score ?? null)).toEqual([2, null]); expect(JSON.parse(fake.calls.at(-1)!.user).retellScore).toBeNull();
  expect(report.summary.lines).toContain("本日最新完成复述的评分不可用。");
  const second = await run(request(other)); expect(second.retellScores.map(item => item.sessionId)).toEqual([otherSession.id]); expect(second.retellScores[0]!.result!.score).toBe(2);
});
it("策略2让旧final失效，合格相同输入复用历史成功score但不复用旧派生report", async () => {
  const { id } = await fixture(); const fake = fakeModel(); const run = createNightlyRunner({ llm: fake.llm, now });
  const first = await run(request(id)); const oldVersion = await legacyJob(id, first, JSON.parse(fake.calls.at(-1)!.user));
  const current = await run(request(id)); expect(current.sourceVersion).not.toBe(oldVersion);
  expect(fake.calls.map(call => call.agent)).toEqual(["score", "report", "report"]);
  const steps = await getPrisma().nightlyStep.findMany({ where: { jobId: Number(current.id.slice(6)) } });
  expect(steps.find(step => step.key.startsWith("score:"))!.reusedFromJobId).toBe(Number(first.id.slice(6)));
  expect(steps.find(step => step.key === "report")!.reusedFromJobId).toBeNull();
});
it("新增非评分来源仍复用合格相同score，真正失败只有显式retry重试", async () => {
  const { id, s } = await fixture(); let fail = true;
  const fake = fakeModel(req => req.agent === "report" ? factualFallback(JSON.parse(req.user)) : fail ? "fail" : { score: 1, reason: "参考" }); const run = createNightlyRunner({ llm: fake.llm, now });
  await run(request(id)); await outcome(s, "山", "correct", "2026-11-14T02:01:00.000Z"); await run(request(id)); expect(fake.calls.filter(call => call.agent === "score")).toHaveLength(1);
  fail = false; const retried = await run({ ...request(id), retryFailed: true }); expect(retried.retellScores[0]!.result!.score).toBe(1); expect(fake.calls.filter(call => call.agent === "score")).toHaveLength(2);
  await outcome(s, "水", "wrong", "2026-11-14T02:02:00.000Z"); const next = await run(request(id)); expect(next.facts.wrongChars).toEqual(["水"]); expect(fake.calls.filter(call => call.agent === "score")).toHaveLength(2);
});
