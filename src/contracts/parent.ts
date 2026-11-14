/** 契约2.8：家长接口默认关闭，只向已授权家庭投影必要数据。 */
import { z } from "zod";
import { Id, IsoDateTime, Child, ChildChar, IncidentType, AgentName } from "./schemas";
import { DailyReportSchema } from "./nightly";
export const ParentStatusSchema = z.object({ enabled: z.boolean(), authenticated: z.boolean() }).strict();
export const ParentChildSchema = Child.pick({ id: true, nickname: true, grade: true }).strict();
export const ParentLoginSchema = z.object({ password: z.string().min(1).max(512) }).strict();
const count = z.number().int().min(0);
export const ParentProgressSchema = z.object({
  child: ParentChildSchema,
  chars: z.array(ChildChar).max(100),
  counts: z.object({ recognize: count, understand: count, write: count, review_2d: count, review_7d: count, mastered: count }).strict(),
  nextCursor: z.string().min(1).nullable(),
}).strict().superRefine((progress, ctx) => {
  if (progress.chars.some(item => item.childId !== progress.child.id)) ctx.addIssue({ code: "custom", message: "进度来源与孩子不一致。" });
});
export const ParentIncidentSchema = z.object({
  id: Id, childId: Id, sessionId: Id, type: IncidentType,
  note: z.string().max(500), resolved: z.boolean(), revision: z.number().int().min(0),
  createdAt: IsoDateTime, agent: AgentName.nullable(), model: z.string().max(120).nullable(), turnCreatedAt: IsoDateTime.nullable(),
}).strict();
const cursor = z.string().min(1).max(2048).nullable();
export const ParentReportsPageSchema = z.object({ reports: z.array(DailyReportSchema).max(20), nextCursor: cursor }).strict();
export const ParentIncidentsPageSchema = z.object({ incidents: z.array(ParentIncidentSchema).max(20), nextCursor: cursor }).strict();
export const IncidentContextSchema = z.object({ incidentId: Id, childId: Id, sessionId: Id }).strict();
export const ParentIncidentResolveSchema = z.object({ resolved: z.boolean(), expectedRevision: z.number().int().min(0) }).strict();
export const ParentReviewAuditSchema = z.object({
  id: Id, incidentId: Id, childId: Id, actor: z.literal("parent"),
  requestId: Id, revisionBefore: z.number().int().min(0), revisionAfter: z.number().int().min(0),
  resolvedBefore: z.boolean(), resolvedAfter: z.boolean(), createdAt: IsoDateTime,
}).strict().superRefine((audit, ctx) => {
  if (audit.revisionAfter !== audit.revisionBefore + 1 || audit.resolvedBefore === audit.resolvedAfter) ctx.addIssue({ code: "custom", message: "人工处理审计的版本或状态不一致。" });
});
export const ParentDeletionPreviewSchema = z.object({
  childId: Id, generatedAt: IsoDateTime, fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  counts: z.record(z.number().int().min(0)), executable: z.literal(false),
}).strict();
