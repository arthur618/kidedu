import type { z } from "zod";
import type { LlmClient, LlmResult, ModelConfig } from "../contracts/llm";
import { NightlyRunRequestSchema, DailyReportSchema, type DailyReport } from "../contracts/nightly";
import { ScoreOutput, ReportInput, ReportOutput } from "../contracts/schemas";
import { getPrisma, withTransaction } from "../db/client";
import { getOrCreateJob, acquireJob, assertLease, releaseJob, publishJob, NightlyLeaseLostError } from "../db/nightly/store";
import { createLlmClient } from "../llm/client";
import { loadRuntimeConfig } from "../llm/config";
import configJson from "../../config/models.json" with { type: "json" };
import { budgetFetch, captureTurn, defaultModelOptions, measuredClient, persistTurns, withinBudget, type ModelOptions, type PendingTurn } from "../server/model";
import { loadSource, fingerprint, type SourceSnapshot } from "./source";
import { scoreRetell, generateReport, faithfulReport, factualFallback } from "./agents";

export interface NightlyOptions {
  now?: () => Date;
  config?: ModelConfig;
  /** 仅工厂测试注入；生产CLI永远创建经过DeepSeek校验的客户端。 */
  llm?: LlmClient;
  modelOptions?: Partial<ModelOptions>;
  /** 本地恢复验证：模型结果返回后、存库前模拟进程退出。不写控制台。 */
  afterCall?: () => Promise<void>;
  afterStep?: (key: string) => Promise<void>;
  beforePublish?: () => Promise<void>;
}
/** 可以由任意调度器注入调用；不安装cron、不枚举孩子。 */
export function createNightlyRunner(options: NightlyOptions = {}) {
  const now = options.now ?? (() => new Date());
  const config = loadRuntimeConfig(options.config ?? configJson);
  const modelOptions = { ...defaultModelOptions, modelName: (agent: keyof ModelConfig) => config[agent].model, ...options.modelOptions };
  const llm = options.llm ?? createLlmClient({ config, fetch: budgetFetch, getEnv: name => process.env[name], now: modelOptions.nowMs, onTurn: captureTurn });
  return async (rawRequest: unknown): Promise<DailyReport> => {
    const request = NightlyRunRequestSchema.parse(rawRequest);
    // 来源读取和版本登记同事务，模型全部在事务外执行。
    const job = await withTransaction(async () => getOrCreateJob(request, await loadSource(request)));
    const token = await acquireJob(job.id, now());
    try {
      const current = (await getPrisma().nightlyJob.findUnique({ where: { id: job.id } }))!;
      if (current.final && !request.retryFailed) return DailyReportSchema.parse(JSON.parse(current.final));
      if (current.final) await withTransaction(async () => {
        await assertLease(job.id, token, now());
        // 显式重试可能改变派生ReportInput；崩溃后默认运行须恢复，不能直接返回旧final。
        await getPrisma().nightlyJob.update({ where: { id: job.id }, data: { final: null } });
      });
      const source = JSON.parse(job.snapshot) as SourceSnapshot;
      const sourceSessionIds = source.facts.sessionIds;
      const priorJobIds = (await getPrisma().nightlyJob.findMany({ where: { childId: job.childId, date: job.date, timezone: job.timezone, id: { lt: job.id } }, select: { id: true } })).map(row => row.id);
      async function step<T>(key: string, input: unknown, schema: z.ZodType<T>, sessionId: string, call: (client: LlmClient) => Promise<LlmResult<T>>, validate?: (value: T) => boolean): Promise<T | null> {
        const inputFingerprint = fingerprint(input);
        const where = { jobId_key_inputFingerprint: { jobId: job.id, key, inputFingerprint } };
        let old = await getPrisma().nightlyStep.findUnique({ where });
        if (!old && priorJobIds.length) {
          // 原始来源新增不意味着相同评分输入要再付费。失败也只在显式重试时调用。
          const priorWhere = { jobId: { in: priorJobIds }, key, inputFingerprint };
          const prior = await getPrisma().nightlyStep.findFirst({ where: { ...priorWhere, status: "succeeded" }, orderBy: { jobId: "desc" } }) ?? await getPrisma().nightlyStep.findFirst({ where: { ...priorWhere, status: "failed" }, orderBy: { jobId: "desc" } });
          if (prior) old = await withTransaction(async () => {
            await assertLease(job.id, token, now());
            return getPrisma().nightlyStep.create({ data: { jobId: job.id, key, inputFingerprint, reusedFromJobId: prior.jobId, status: prior.status, result: prior.result, error: prior.error } });
          });
        }
        if (old?.status === "succeeded") return schema.parse(JSON.parse(old.result!));
        if (old?.status === "failed" && !request.retryFailed) return null;
        await withTransaction(async () => {
          await assertLease(job.id, token, now());
          await getPrisma().nightlyStep.upsert({ where, create: { jobId: job.id, key, inputFingerprint, status: "running" }, update: { status: "running", reusedFromJobId: null, result: null, error: null } });
        });
        const turns: PendingTurn[] = [];
        const result = await withinBudget(modelOptions, [], () => call(measuredClient(llm, modelOptions, turns, true)));
        await options.afterCall?.();
        let value: T | null = null;
        let error: string | undefined;
        if (!result.ok) error = result.error;
        else {
          const parsed = schema.safeParse(result.data);
          if (!parsed.success) error = "invalid_output";
          else if (validate && !validate(parsed.data)) error = "source_mismatch";
          else value = parsed.data;
        }
        // 计量归属/白名单输出与步骤结果一起提交。原始理由只进私有step.result。
        const committed = await withTransaction(async () => {
          const owner = await getPrisma().nightlyJob.findUnique({ where: { id: job.id } });
          const ownsLease = owner?.leaseToken === token && !!owner.leaseUntil && owner.leaseUntil > now().toISOString();
          // 迟到调用仍计量，但失去租约的结果不能改变步骤或发布。
          await persistTurns(sessionId, turns, error || !ownsLease ? "blocked" : "skipped", now, { activity: "nightly", step: key, jobId: job.id, sourceVersion: job.sourceVersion, sourceSessionIds, inputFingerprint, ...(error || !ownsLease ? { errorCategory: error ?? "lease_lost" } : {}) });
          if (!ownsLease) return false;
          await assertLease(job.id, token, now());
          await getPrisma().nightlyStep.update({ where, data: { status: error ? "failed" : "succeeded", result: value === null ? null : JSON.stringify(value), error: error ?? null } });
          return true;
        });
        if (!committed) throw new NightlyLeaseLostError();
        await options.afterStep?.(key);
        return value;
      }
      const retellScores: DailyReport["retellScores"] = [];
      for (const activity of source.retells) {
        const result = await step(`score:${activity.sessionId}`, activity.input, ScoreOutput, activity.sessionId, client => scoreRetell(client, activity.input, activity.sessionId));
        retellScores.push({ sessionId: activity.sessionId, completedAt: activity.completedAt, status: result ? "scored" : "unavailable", result: result ? { score: result.score, reason: "模型评分完成，仅供参考。" } : null });
      }
      const input = ReportInput.parse({ child: source.child, date: request.date, minutes: source.facts.minutes, homework: source.facts.homework.map(h => h.item), wrongChars: source.facts.wrongChars, retellScore: retellScores.at(-1)?.result?.score ?? null });
      // 确定的最新来源会话承载日报调用；无会话不造Session、不调用。
      const anchor = source.sessions.at(-1)?.id;
      const summary = anchor ? await step("report", input, ReportOutput, anchor, client => generateReport(client, input, anchor), value => faithfulReport(input, value)) : null;
      const report = DailyReportSchema.parse({ id: `daily_${job.id}`, childId: request.childId, date: request.date, timezone: request.timezone, sourceVersion: job.sourceVersion, facts: source.facts, retellScores, summary: summary ?? factualFallback(input), summaryStatus: !anchor ? "not_needed" : summary ? "generated" : "fallback", generatedAt: now().toISOString() });
      await options.beforePublish?.();
      await publishJob(job, token, report, now());
      return report;
    } finally { await releaseJob(job.id, token); }
  };
}
