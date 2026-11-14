import { getPrisma } from "../../../src/db/client";
import { insertIncident } from "../../../src/db/incident";
import { DailyReportSchema } from "../../../src/contracts/nightly";
export const PASSWORD = "fictional-parent-password-only-for-tests";
export const ENV = { PARENT_ACCESS_PASSWORD: PASSWORD, PARENT_ALLOWED_CHILD_IDS: "parent-a,parent-b" };
export const NOW = "2026-11-14T02:00:00.000Z";
export function daily(childId: string, date = "2026-11-14") {
  return DailyReportSchema.parse({ id: `report-${childId}-${date}`, childId, date, timezone: "Asia/Shanghai", sourceVersion: "a".repeat(64), generatedAt: NOW,
    facts: { childId, date, timezone: "Asia/Shanghai", sessionIds: [`s-${childId}`], finishedSessionIds: [`s-${childId}`], unfinishedSessionIds: [], minutes: 7, learningCoverage: "partial", outcomeCount: 1, practicedChars: ["山"], reviewedChars: [], wrongChars: ["山"], completedEssaySessionIds: [], homework: [] },
    retellScores: [{ sessionId: `s-${childId}`, completedAt: NOW, status: "scored", result: { score: 0, reason: "" } }, { sessionId: `s2-${childId}`, completedAt: NOW, status: "unavailable", result: null }],
    summary: { lines: ["今天练习了山字。"], parentAction: "陪孩子读一读。" }, summaryStatus: "generated" });
}
export async function seedParent() {
  const db = getPrisma();
  for (const table of ["sessionRuntime", "coachRuntime", "readingRuntime", "essayRuntime", "sessionCommand", "learningOutcome", "sessionLearningCoverage", "parentReviewRequest", "parentReviewAudit", "incidentContext", "parentAccessSession", "parentLoginLimit", "nightlyPublication", "nightlyStep", "nightlyJob", "incident", "turn", "childChar", "session", "child"] as const) await (db[table] as { deleteMany(): Promise<unknown> }).deleteMany();
  for (const [id, nickname] of [["parent-a", "编造小禾"], ["parent-b", "编造小雨"], ["other-child", "不可见孩子"]]) {
    await db.child.create({ data: { id: id!, nickname: nickname!, grade: 3, interests: "[]", dailyLimitMinutes: 40 } });
    await db.session.create({ data: { id: `s-${id}`, childId: id!, startedAt: NOW, endedAt: NOW, homework: "[]" } });
    await db.session.create({ data: { id: `s2-${id}`, childId: id!, startedAt: NOW, endedAt: NOW, homework: "[]" } });
    await insertIncident({ id: `incident-${id}`, type: "knowledge", turnId: null, note: "data:image/png;base64,PRIVATE https://invalid.test/photo <img src='private'>不公开原文", resolved: false, createdAt: NOW }, `s-${id}`);
    const report = daily(id!);
    const job = await db.nightlyJob.create({ data: { childId: id!, date: report.date, timezone: report.timezone, sourceVersion: report.sourceVersion, snapshot: "PRIVATE-SNAPSHOT-ESSAY-KEYPOINTS", final: "PRIVATE-FINAL" } });
    await db.nightlyPublication.create({ data: { childId: id!, date: report.date, timezone: report.timezone, jobId: job.id, data: JSON.stringify(report) } });
  }
  await db.incident.create({ data: { id: "unattributed", type: "safety", turnId: null, note: "UNATTRIBUTED-PRIVATE", resolved: false, createdAt: NOW } });
  for (let n = 0; n < 105; n++) await db.childChar.create({ data: { childId: "parent-a", char: String.fromCodePoint(0x4e00 + n), kind: "write", stage: n < 102 ? "understand" : "mastered", correctStreak: 0, wrongCount: 0 } });
}
