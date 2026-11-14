/** 契约2.6：C11学习流水、日报事实与家长公共投影。 */
import { z } from "zod";
import { Id, IsoDate, IsoDateTime, CharKind, CharStage, HomeworkItem, ReportOutput, ScoreOutput } from "./schemas";
import { CharResultSchema } from "./orchestrator";

export const ReportingTimezoneSchema = z.enum(["Asia/Shanghai", "UTC"]);
export const ReportingDateSchema = IsoDate.refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "请填写真实日历日期。");
export const NightlyRunRequestSchema = z.object({ childId: Id, date: ReportingDateSchema, timezone: ReportingTimezoneSchema.default("Asia/Shanghai"), retryFailed: z.boolean().default(false) }).strict();
/** 仅记录真实persist_char；同事务写入，command/effectIndex唯一，append-only。 */
export const LearningOutcomeSchema = z.object({
  id: Id, sessionId: Id, childId: Id, commandScope: Id, commandKey: Id, effectIndex: z.number().int().min(0),
  char: z.string().length(1), kind: CharKind, stageBefore: CharStage, stageAfter: CharStage,
  result: CharResultSchema, occurredAt: IsoDateTime,
}).strict();
export type LearningOutcome = z.infer<typeof LearningOutcomeSchema>;
export const DailyFactsSchema = z.object({
  childId: Id, date: ReportingDateSchema, timezone: ReportingTimezoneSchema,
  sessionIds: z.array(Id), finishedSessionIds: z.array(Id), unfinishedSessionIds: z.array(Id),
  minutes: z.number().int().min(0), // 已结束会话的合并区间分钟，不代表专注时长
  learningCoverage: z.enum(["complete", "partial", "none"]),
  outcomeCount: z.number().int().min(0),
  practicedChars: z.array(z.string().length(1)),
  reviewedChars: z.array(z.string().length(1)),
  wrongChars: z.array(z.string().length(1)),
  completedEssaySessionIds: z.array(Id), // EssayRuntime.complete且completedAt在本日，不传正文
  homework: z.array(z.object({ sessionId: Id, item: HomeworkItem }).strict()),
}).strict();
export type DailyFacts = z.infer<typeof DailyFactsSchema>;
export const RetellScoreResultSchema = z.object({
  sessionId: Id, completedAt: IsoDateTime,
  status: z.enum(["scored", "unavailable"]),
  result: ScoreOutput.nullable(),
}).strict().superRefine((item, ctx) => {
  if ((item.status === "scored") !== (item.result !== null)) ctx.addIssue({ code: "custom", message: "评分状态与结果不一致。" });
});
export const DailyReportSchema = z.object({
  id: Id, childId: Id, date: ReportingDateSchema, timezone: ReportingTimezoneSchema,
  sourceVersion: z.string().regex(/^[a-f0-9]{64}$/),
  facts: DailyFactsSchema,
  retellScores: z.array(RetellScoreResultSchema),
  summary: ReportOutput,
  summaryStatus: z.enum(["generated", "fallback", "not_needed"]),
  generatedAt: IsoDateTime,
}).strict().superRefine((report, ctx) => {
  if (report.childId !== report.facts.childId || report.date !== report.facts.date || report.timezone !== report.facts.timezone) {
    ctx.addIssue({ code: "custom", message: "日报来源与孩子、日期、时区不一致。" });
  }
});
export type DailyReport = z.infer<typeof DailyReportSchema>;
