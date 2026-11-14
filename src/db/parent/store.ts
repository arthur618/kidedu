import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getPrisma, withTransaction } from "../client";
import { type DailyReport } from "../../contracts/nightly";
import { CharStage } from "../../contracts/schemas";
import { ParentChildSchema, ParentProgressSchema, ParentReportsPageSchema, ParentIncidentsPageSchema, ParentIncidentSchema, ParentReviewAuditSchema, ParentDeletionPreviewSchema } from "../../contracts/parent";
import { getDailyReport } from "../../nightly";
import { encodeCursor, decodeCursor, hash, notFound, ParentError, type ParentConfig } from "../../server/parent/security";
export async function children(config: ParentConfig) {
  return (await getPrisma().child.findMany({ where: { id: { in: config.childIds } }, select: { id: true, nickname: true, grade: true }, orderBy: { id: "asc" } })).map(row => ParentChildSchema.parse(row));
}
export async function authorizedChild(config: ParentConfig, childId: string) {
  if (!config.childIds.includes(childId)) throw notFound();
  const row = await getPrisma().child.findUnique({ where: { id: childId }, select: { id: true, nickname: true, grade: true } });
  if (!row) throw notFound(); return ParentChildSchema.parse(row);
}
export async function progress(config: ParentConfig, childId: string, stage: string | null, cursor: string | null) {
  const child = await authorizedChild(config, childId);
  if (stage !== null && !CharStage.safeParse(stage).success) throw notFound();
  const scope = JSON.stringify([childId, "progress", stage]);
  const last = decodeCursor(cursor, config, scope);
  const where = { childId, ...(stage ? { stage } : {}) };
  if (last && !await getPrisma().childChar.findFirst({ where: { ...where, char: last } })) throw notFound();
  const rows = await getPrisma().childChar.findMany({ where: { ...where, ...(last ? { char: { gt: last } } : {}) }, orderBy: { char: "asc" }, take: 101 });
  const counts = { recognize: 0, understand: 0, write: 0, review_2d: 0, review_7d: 0, mastered: 0 };
  for (const group of await getPrisma().childChar.groupBy({ by: ["stage"], where: { childId }, _count: true })) {
    const parsed = CharStage.safeParse(group.stage); if (parsed.success) counts[parsed.data] = group._count;
  }
  return ParentProgressSchema.parse({ child, counts, chars: rows.slice(0, 100), nextCursor: rows.length > 100 ? encodeCursor(config, scope, rows[99]!.char) : null });
}
async function checkedReport(childId: string, date: string, timezone: string): Promise<DailyReport | null> {
  const result = await getDailyReport(childId, date, timezone);
  if (!result) return null;
  const f = result.facts;
  const ids = [...new Set([...f.sessionIds, ...f.finishedSessionIds, ...f.unfinishedSessionIds, ...f.completedEssaySessionIds, ...f.homework.map(row => row.sessionId), ...result.retellScores.map(row => row.sessionId)])];
  if (await getPrisma().session.count({ where: { childId, id: { in: ids } } }) !== ids.length) throw new Error("日报会话来源不一致。");
  return result;
}
export async function reports(config: ParentConfig, childId: string, cursor: string | null) {
  await authorizedChild(config, childId);
  const scope = JSON.stringify([childId, "reports"]); const last = decodeCursor(cursor, config, scope);
  let after: { date: string; timezone: string } | null = null;
  if (last) { try { after = JSON.parse(last); } catch { throw notFound(); } }
  if (after && !await getPrisma().nightlyPublication.findUnique({ where: { childId_date_timezone: { childId, ...after } } })) throw notFound();
  const rows = await getPrisma().nightlyPublication.findMany({ where: { childId, ...(after ? { OR: [{ date: { lt: after.date } }, { date: after.date, timezone: { gt: after.timezone } }] } : {}) }, select: { date: true, timezone: true }, orderBy: [{ date: "desc" }, { timezone: "asc" }], take: 21 });
  const items = await Promise.all(rows.slice(0, 20).map(row => checkedReport(childId, row.date, row.timezone)));
  return ParentReportsPageSchema.parse({ reports: items.filter(Boolean), nextCursor: rows.length > 20 ? encodeCursor(config, scope, JSON.stringify(rows[19])) : null });
}
export async function report(config: ParentConfig, childId: string, id: string) {
  await authorizedChild(config, childId);
  const rows = await getPrisma().$queryRaw<{ date: string; timezone: string }[]>`SELECT date, timezone FROM NightlyPublication WHERE childId=${childId} AND json_valid(data) AND json_extract(data, '$.id')=${id} LIMIT 1`;
  const row = rows[0]; if (!row) throw notFound();
  const result = await checkedReport(childId, row.date, row.timezone); if (!result || result.id !== id) throw notFound(); return result;
}
// 查询不选择Turn正文、事件自由note或私有活动；旧无可信归属记录自然隐藏。
async function incidentRows(childId: string, id?: string, after?: string, take = 21) {
  return getPrisma().$queryRaw<{ id: string; childId: string; sessionId: string; type: string; resolved: boolean | number; revision: number; createdAt: string; agent: string | null; model: string | null; turnCreatedAt: string | null }[]>(Prisma.sql`
    SELECT i.id, s.childId, s.id AS sessionId, i.type, i.resolved, i.revision, i.createdAt,
      t.agent, t.model, t.createdAt AS turnCreatedAt FROM Incident i
    LEFT JOIN IncidentContext c ON c.incidentId=i.id
    LEFT JOIN Turn t ON t.id=i.turnId
    JOIN Session s ON s.id=COALESCE(c.sessionId,t.sessionId)
    WHERE s.childId=${childId} AND (c.incidentId IS NOT NULL OR t.id IS NOT NULL)
    AND (c.incidentId IS NULL OR c.childId=s.childId)
    AND (i.turnId IS NULL OR (t.id IS NOT NULL AND t.sessionId=s.id))
    ${id ? Prisma.sql`AND i.id=${id}` : Prisma.empty}
    ${after ? Prisma.sql`AND i.id > ${after}` : Prisma.empty}
    ORDER BY i.id ASC LIMIT ${take}`);
}
function projectIncident(row: Awaited<ReturnType<typeof incidentRows>>[number]) {
  return ParentIncidentSchema.parse({ ...row, resolved: !!row.resolved,
    note: "系统记录了一次需要留意的情况。此处仅展示事件概况，不能回放原始输出。",
    model: row.model && /^[A-Za-z0-9_.-]{1,120}$/.test(row.model) ? row.model : null });
}
export async function incidentDetail(config: ParentConfig, childId: string, id: string) {
  await authorizedChild(config, childId); const row = (await incidentRows(childId, id, undefined, 1))[0];
  if (!row) throw notFound(); return projectIncident(row);
}
export async function incidents(config: ParentConfig, childId: string, cursor: string | null) {
  await authorizedChild(config, childId); const scope = JSON.stringify([childId, "incidents"]); const last = decodeCursor(cursor, config, scope);
  if (last) await incidentDetail(config, childId, last);
  const rows = await incidentRows(childId, undefined, last ?? undefined);
  return ParentIncidentsPageSchema.parse({ incidents: rows.slice(0, 20).map(projectIncident), nextCursor: rows.length > 20 ? encodeCursor(config, scope, rows[19]!.id) : null });
}
export async function resolve(config: ParentConfig, childId: string, id: string, requestId: string, body: { resolved: boolean; expectedRevision: number }, now: Date, assertAccess: () => Promise<void>) {
  return withTransaction(async () => {
    await assertAccess();
    const current = await incidentDetail(config, childId, id);
    const fingerprint = hash(JSON.stringify(["POST", `/children/${childId}/incidents/${id}/resolve`, body.resolved, body.expectedRevision]));
    const existing = await getPrisma().parentReviewRequest.findUnique({ where: { requestId } });
    if (existing) { if (existing.fingerprint !== fingerprint || existing.childId !== childId || existing.incidentId !== id) throw new ParentError(409, "这次操作标识已被使用，请刷新后重试。"); return ParentIncidentSchema.parse(JSON.parse(existing.response)); }
    if (current.revision !== body.expectedRevision) throw new ParentError(409, "记录已更新，请刷新后再处理。");
    let response = current;
    if (current.resolved !== body.resolved) {
      const updated = await getPrisma().incident.updateMany({ where: { id, revision: body.expectedRevision, resolved: current.resolved }, data: { resolved: body.resolved, revision: { increment: 1 } } });
      if (updated.count !== 1) throw new ParentError(409, "记录已更新，请刷新后再处理。");
      const audit = ParentReviewAuditSchema.parse({ id: randomUUID(), incidentId: id, childId, actor: "parent", requestId, revisionBefore: current.revision, revisionAfter: current.revision + 1, resolvedBefore: current.resolved, resolvedAfter: body.resolved, createdAt: now.toISOString() });
      await getPrisma().parentReviewAudit.create({ data: audit });
      response = { ...current, resolved: body.resolved, revision: current.revision + 1 };
    }
    await getPrisma().parentReviewRequest.create({ data: { requestId, childId, incidentId: id, fingerprint, response: JSON.stringify(response) } });
    return response;
  });
}
export async function deletionPreview(config: ParentConfig, childId: string, now: Date) {
  await authorizedChild(config, childId);
  return withTransaction(async () => {
    const db = getPrisma();
    const ids = (await db.session.findMany({ where: { childId }, select: { id: true } })).map(row => row.id);
    const turns = (await db.turn.findMany({ where: { sessionId: { in: ids } }, select: { id: true } })).map(row => row.id);
    const jobs = (await db.nightlyJob.findMany({ where: { childId }, select: { id: true } })).map(row => row.id);
    const incidentIds = (await db.incident.findMany({ where: { OR: [{ turnId: { in: turns } }, { id: { in: (await db.incidentContext.findMany({ where: { OR: [{ childId }, { sessionId: { in: ids } }] }, select: { incidentId: true } })).map(row => row.incidentId) } }] }, select: { id: true } })).map(row => row.id);
    const counts = {
      Child: await db.child.count({ where: { id: childId } }), ChildChar: await db.childChar.count({ where: { childId } }), Session: ids.length, Turn: turns.length,
      SessionRuntime: await db.sessionRuntime.count({ where: { sessionId: { in: ids } } }), CoachRuntime: await db.coachRuntime.count({ where: { sessionId: { in: ids } } }), ReadingRuntime: await db.readingRuntime.count({ where: { sessionId: { in: ids } } }), EssayRuntime: await db.essayRuntime.count({ where: { sessionId: { in: ids } } }),
      SessionCommand: await db.sessionCommand.count({ where: { OR: [{ sessionId: { in: ids } }, { scope: { in: [`child:${childId}`, ...ids.map(id => `session:${id}`)] } }] } }),
      LearningOutcome: await db.learningOutcome.count({ where: { OR: [{ childId }, { sessionId: { in: ids } }] } }), SessionLearningCoverage: await db.sessionLearningCoverage.count({ where: { sessionId: { in: ids } } }),
      Incident: incidentIds.length, IncidentContext: await db.incidentContext.count({ where: { OR: [{ childId }, { incidentId: { in: incidentIds } }] } }),
      ParentReviewAudit: await db.parentReviewAudit.count({ where: { OR: [{ childId }, { incidentId: { in: incidentIds } }] } }), ParentReviewRequest: await db.parentReviewRequest.count({ where: { OR: [{ childId }, { incidentId: { in: incidentIds } }] } }),
      NightlyJob: jobs.length, NightlyStep: await db.nightlyStep.count({ where: { jobId: { in: jobs } } }), NightlyPublication: await db.nightlyPublication.count({ where: { childId } }),
    };
    const generatedAt = now.toISOString();
    return ParentDeletionPreviewSchema.parse({ childId, generatedAt, counts, fingerprint: hash(JSON.stringify({ childId, generatedAt, counts, ids, turns, jobs, incidentIds })), executable: false });
  });
}
