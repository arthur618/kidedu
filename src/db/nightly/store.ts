import { randomUUID } from "node:crypto";
import type { NightlyJob } from "@prisma/client";
import { NightlyRunRequestSchema, DailyReportSchema, type DailyReport } from "../../contracts/nightly";
import { getPrisma, withTransaction } from "../client";
import { fingerprint, type SourceSnapshot, type RunRequest } from "../../nightly/source";
export class NightlyBusyError extends Error { constructor() { super("这份日报正在处理中，请稍后再试。"); } }
export class NightlyLeaseLostError extends Error { constructor() { super("这次处理的租约已失效。"); } }
export const LEASE_MS = 120_000;
export async function getOrCreateJob(request: RunRequest, snapshot: SourceSnapshot): Promise<NightlyJob> {
  const sourceVersion = fingerprint(snapshot);
  const key = { childId: request.childId, date: request.date, timezone: request.timezone, sourceVersion };
  return getPrisma().nightlyJob.upsert({ where: { childId_date_timezone_sourceVersion: key }, create: { ...key, snapshot: JSON.stringify(snapshot) }, update: {} });
}
export async function acquireJob(jobId: number, now: Date): Promise<string> {
  const token = randomUUID();
  const result = await getPrisma().nightlyJob.updateMany({ where: { id: jobId, OR: [{ leaseToken: null }, { leaseUntil: { lte: now.toISOString() } }] }, data: { leaseToken: token, leaseUntil: new Date(now.getTime() + LEASE_MS).toISOString() } });
  if (!result.count) throw new NightlyBusyError();
  return token;
}
export async function assertLease(jobId: number, token: string, now: Date): Promise<void> {
  const result = await getPrisma().nightlyJob.updateMany({ where: { id: jobId, leaseToken: token, leaseUntil: { gt: now.toISOString() } }, data: { leaseUntil: new Date(now.getTime() + LEASE_MS).toISOString() } });
  if (!result.count) throw new NightlyLeaseLostError();
}
export async function releaseJob(jobId: number, token: string): Promise<void> {
  await getPrisma().nightlyJob.updateMany({ where: { id: jobId, leaseToken: token }, data: { leaseToken: null, leaseUntil: null } });
}
/** 版本留存；只有本日最新任务可以改公共行。租约与发布在同一SQLite事务内CAS。 */
export async function publishJob(job: NightlyJob, token: string, report: DailyReport, now: Date): Promise<void> {
  const parsed = DailyReportSchema.parse(report);
  if (parsed.childId !== job.childId || parsed.date !== job.date || parsed.timezone !== job.timezone || parsed.sourceVersion !== job.sourceVersion) throw new Error("日报与任务来源不一致。");
  await withTransaction(async () => {
    await assertLease(job.id, token, now);
    const data = JSON.stringify(parsed);
    await getPrisma().nightlyJob.update({ where: { id: job.id }, data: { final: data } });
    const { childId, date, timezone } = job;
    const latest = await getPrisma().nightlyJob.findFirst({ where: { childId, date, timezone }, orderBy: { id: "desc" } });
    if (latest?.id !== job.id) return;
    await getPrisma().nightlyPublication.upsert({ where: { childId_date_timezone: { childId, date, timezone } }, create: { childId, date, timezone, jobId: job.id, data }, update: { jobId: job.id, data } });
  });
}
export async function getDailyReport(childId: string, date: string, timezone: string): Promise<DailyReport | null> {
  const request = NightlyRunRequestSchema.parse({ childId, date, timezone });
  const row = await getPrisma().nightlyPublication.findUnique({ where: { childId_date_timezone: { childId: request.childId, date: request.date, timezone: request.timezone } } });
  if (!row) return null;
  const parsed = DailyReportSchema.parse(JSON.parse(row.data));
  if (parsed.childId !== childId || parsed.date !== date || parsed.timezone !== timezone) throw new Error("日报与发布记录不一致。");
  return parsed;
}
