import { createHash } from "node:crypto";
import { z } from "zod";
import { Child, Session, ScoreInput } from "../contracts/schemas";
import { ReadingRuntimeSchema } from "../contracts/reading";
import { EssayRuntimeSchema } from "../contracts/essay";
import { DailyFactsSchema, LearningOutcomeSchema, NightlyRunRequestSchema, type DailyFacts } from "../contracts/nightly";
import { getPrisma, withTransaction } from "../db/client";

export type RunRequest = z.infer<typeof NightlyRunRequestSchema>;
type RetellEligibility =
  | { eligible: true; input: z.infer<typeof ScoreInput> }
  | { eligible: false; reason: "missing_question" | "question_mismatch" | "missing_key_points" | "missing_transcript" };
export type RetellSource = { sessionId: string; completedAt: string } & RetellEligibility;
export interface SourceSnapshot {
  scoringPolicyVersion: 2;
  child: { id: string; nickname: string };
  facts: DailyFacts;
  sessions: z.infer<typeof Session>[];
  coverage: { sessionId: string; startedAt: string }[];
  outcomes: z.infer<typeof LearningOutcomeSchema>[];
  retells: RetellSource[];
  essays: { sessionId: string; completedAt: string }[];
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function fingerprint(value: unknown): string { return createHash("sha256").update(canonical(value)).digest("hex"); }
export function dayBounds(request: Pick<RunRequest, "date" | "timezone">): { start: number; end: number } {
  const parsed = NightlyRunRequestSchema.parse({ ...request, childId: "validation" });
  const start = Date.parse(`${parsed.date}T00:00:00.000Z`) - (parsed.timezone === "Asia/Shanghai" ? 8 * 60 * 60000 : 0);
  return { start, end: start + 24 * 60 * 60000 };
}
const unique = (values: string[]) => [...new Set(values)].sort();
/** 已结束会话的经过时长。先裁日、再合并重叠区间，最后只取一次整分钟。 */
export function sessionMinutes(sessions: z.infer<typeof Session>[], start: number, end: number): number {
  const intervals: [number, number][] = [];
  for (const session of sessions) {
    if (!session.endedAt) continue;
    const a = Date.parse(session.startedAt), b = Date.parse(session.endedAt);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) throw new Error("会话时间来源无效。");
    if (a < end && b > start) intervals.push([Math.max(start, a), Math.min(end, b)]);
  }
  intervals.sort(([a], [b]) => a - b);
  let total = 0, left: number | null = null, right = 0;
  for (const [a, b] of intervals) {
    if (left === null) { left = a; right = b; }
    else if (a > right) { total += right - left; left = a; right = b; }
    else right = Math.max(right, b);
  }
  return Math.floor((total + (left === null ? 0 : right - left)) / 60000);
}
/** 显式孩子范围；快照事务不包含任何模型调用。自身Turn/job/report不参与来源。 */
export async function loadSource(request: RunRequest): Promise<SourceSnapshot> {
  return withTransaction(async () => {
    const db = getPrisma();
    const childRow = await db.child.findUnique({ where: { id: request.childId } });
    if (!childRow) throw new Error("没有找到这个孩子。");
    const child = Child.pick({ id: true, nickname: true }).parse(childRow);
    const allSessions = (await db.session.findMany({ where: { childId: request.childId }, orderBy: [{ startedAt: "asc" }, { id: "asc" }] })).map(row => Session.parse({ ...row, homework: JSON.parse(row.homework) })).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const { start, end } = dayBounds(request);
    const inDay = (date: string) => Date.parse(date) >= start && Date.parse(date) < end;
    // 校验时间源，即使无重叠也不能静默把负时长当零。
    sessionMinutes(allSessions, start, end);
    const outcomes = (await db.learningOutcome.findMany({ where: { childId: request.childId }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] })).map(row => LearningOutcomeSchema.parse(row)).filter(row => inDay(row.occurredAt));
    const sessionIds = allSessions.map(s => s.id);
    if (outcomes.some(row => !sessionIds.includes(row.sessionId))) throw new Error("学习流水缺少所属会话。");
    const retells: RetellSource[] = [];
    const essays: SourceSnapshot["essays"] = [];
    for (const row of await db.readingRuntime.findMany({ where: { sessionId: { in: sessionIds } }, orderBy: { sessionId: "asc" } })) {
      const raw = JSON.parse(row.data);
      // 旧活动缺首问时只补null供共享schema校验；缺失不意味着可以沿用原题评分。
      const activity = ReadingRuntimeSchema.parse({ ...raw, question: raw.question ?? null });
      if (activity.phase === "complete" && activity.completedAt && inDay(activity.completedAt)) {
        const base = { sessionId: row.sessionId, completedAt: activity.completedAt };
        const transcript = activity.transcript.join("\n");
        if (!activity.question?.trim()) retells.push({ ...base, eligible: false, reason: "missing_question" });
        else if (activity.question !== activity.passage.question) retells.push({ ...base, eligible: false, reason: "question_mismatch" });
        else if (!activity.passage.keyPoints.length || activity.passage.keyPoints.some(point => !point.trim())) retells.push({ ...base, eligible: false, reason: "missing_key_points" });
        else if (!transcript.trim()) retells.push({ ...base, eligible: false, reason: "missing_transcript" });
        else retells.push({ ...base, eligible: true, input: ScoreInput.parse({ question: activity.question, keyPoints: activity.passage.keyPoints, transcript }) });
      }
    }
    retells.sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt) || (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0));
    for (const row of await db.essayRuntime.findMany({ where: { sessionId: { in: sessionIds } }, orderBy: { sessionId: "asc" }, select: { sessionId: true, data: true } })) {
      if (!row.data) continue;
      const activity = EssayRuntimeSchema.pick({ phase: true, completedAt: true }).strip().parse(JSON.parse(row.data));
      if (activity.phase === "complete" && activity.completedAt && inDay(activity.completedAt)) essays.push({ sessionId: row.sessionId, completedAt: activity.completedAt });
    }
    const relevant = new Set([...outcomes.map(o => o.sessionId), ...retells.map(r => r.sessionId), ...essays.map(e => e.sessionId)]);
    const sessions = allSessions.filter(s => relevant.has(s.id) || (Date.parse(s.startedAt) < end && (!s.endedAt || Date.parse(s.endedAt) > start)) || (s.endedAt && inDay(s.endedAt)));
    const coverage = await db.sessionLearningCoverage.findMany({ where: { sessionId: { in: sessions.map(s => s.id) } }, orderBy: { sessionId: "asc" } });
    const covered = sessions.filter(s => coverage.some(c => c.sessionId === s.id && c.startedAt === s.startedAt)).length;
    const facts = DailyFactsSchema.parse({ childId: request.childId, date: request.date, timezone: request.timezone,
      sessionIds: sessions.map(s => s.id), finishedSessionIds: sessions.filter(s => s.endedAt).map(s => s.id), unfinishedSessionIds: sessions.filter(s => !s.endedAt).map(s => s.id),
      minutes: sessionMinutes(sessions, start, end), learningCoverage: sessions.length > 0 && covered === sessions.length ? "complete" : covered > 0 || outcomes.length > 0 ? "partial" : "none",
      outcomeCount: outcomes.length, practicedChars: unique(outcomes.map(o => o.char)), reviewedChars: unique(outcomes.filter(o => ["review_2d", "review_7d"].includes(o.stageBefore)).map(o => o.char)), wrongChars: unique(outcomes.filter(o => o.result === "wrong").map(o => o.char)),
      completedEssaySessionIds: essays.map(e => e.sessionId), homework: sessions.filter(s => s.endedAt && inDay(s.endedAt)).flatMap(s => s.homework.map(item => ({ sessionId: s.id, item }))) });
    return { scoringPolicyVersion: 2, child, facts, sessions, coverage, outcomes, retells, essays };
  });
}
