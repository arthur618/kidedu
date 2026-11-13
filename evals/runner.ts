import { mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import runtimeConfig from "../config/models.json";
import { RUNTIME_AGENTS, type LlmClient, type LlmTurnRecord, type ModelConfig } from "../src/contracts/llm";
import * as schemas from "../src/contracts/schemas";
import { runCharCoach, runReader, runEssay, runVisionHomework, runVisionDictation } from "../src/agents";
import { guard } from "../src/guard";
import { loadRuntimeConfig } from "../src/llm/config";
import { createLlmClient } from "../src/llm/client";
import { checks, dictationCounts, mandatoryChecks } from "./checks";
import { loadPrivateCases, loadPublicCases, type LoadedCase } from "./load";
import { formatReport, redact, redactValue, summarize } from "./results";
import { agents, type EvalAgent, type EvalReport, type CaseResult } from "./types";

export interface RunOptions {
  rootDir: string;
  agent?: EvalAgent;
  model?: string;
  limit?: number;
  /** 测试注入编造样例；正式CLI始终从文件读。 */
  cases?: LoadedCase[];
  createClient?: (onTurn: (turn: LlmTurnRecord) => void, config: ModelConfig) => LlmClient;
  getEnv?: (name: string) => string | undefined;
  now?: () => number;
  print?: (text: string) => void;
  config?: unknown;
}
export function modelConfig(value: unknown, model?: string): ModelConfig {
  // 先验证原配置，不把不允许的provider通过override变成合法配置。
  const config = loadRuntimeConfig(value);
  if (model !== undefined && !model.trim()) throw new Error("模型名不能为空");
  return loadRuntimeConfig(Object.fromEntries(RUNTIME_AGENTS.map(agent => [agent, { ...config[agent], ...(model ? { model } : {}) }])));
}
async function invoke(entry: LoadedCase, llm: LlmClient): Promise<unknown> {
  const input = entry.sample.input;
  switch (entry.agent) {
    case "char_coach": return runCharCoach(schemas.CharCoachInput.parse(input), { llm });
    case "reader": return runReader(schemas.ReaderInput.parse(input), { llm });
    case "essay": return runEssay(schemas.EssayInput.parse(input), { llm });
    case "vision_homework": return runVisionHomework(schemas.VisionHomeworkInput.parse(input), { llm });
    case "vision_dictation": return runVisionDictation(schemas.VisionDictationInput.parse(input), { llm });
    case "guard": return guard(schemas.GuardInput.parse(input), entry.sample.extra ?? {}, { llm });
  }
}
export async function evaluateCase(entry: LoadedCase, create: RunOptions["createClient"], config: ModelConfig): Promise<CaseResult> {
  const turns: LlmTurnRecord[] = [];
  const callErrors: string[] = [];
  const modelOutputs: unknown[] = [];
  let calls = 0;
  const underlying = create!((turn) => {
    // 显式选取公共契约字段；不透传实现层的附加字段。
    turns.push({ agent: turn.agent, model: turn.model, inputTokens: turn.inputTokens, cachedInputTokens: turn.cachedInputTokens, outputTokens: turn.outputTokens, latencyMs: turn.latencyMs, ok: turn.ok, ...(turn.error ? { error: turn.error } : {}) });
  }, config);
  const llm: LlmClient = { async call(request) {
    calls++;
    try {
      const response = await underlying.call(request);
      if (response.ok) modelOutputs.push(response.data);
      else callErrors.push(response.error);
      return response;
    } catch {
      callErrors.push("client_exception");
      // 不把异常对象/文本暴露到结果，避免厂商或替身意外夹带秘密。
      return { ok: false, error: "provider_error", model: config[entry.agent].model, latencyMs: 0 };
    }
  } };
  let output: unknown = null;
  try { output = await invoke(entry, llm); } catch { callErrors.push("agent_exception"); }
  const noCallAllowed = entry.agent === "guard" && schemas.GuardOutput.safeParse(output).success && (output as schemas.GuardOutput).layer === "rule";
  if (calls === 0 && !noCallAllowed) callErrors.push("missing_model_call");
  if (calls !== turns.length) callErrors.push("missing_turn_record");
  if (turns.some(t => !t.ok) && !callErrors.length) callErrors.push("failed_turn");
  const results: CaseResult["checks"] = {};
  for (const name of new Set([...mandatoryChecks[entry.agent], ...(entry.sample.shouldEscalate ? ["escalates"] : []), ...entry.sample.checks])) {
    const check = checks[name];
    results[name] = check ? check({ agent: entry.agent, sample: entry.sample }, output) : { pass: false, detail: "未知检查名" };
  }
  results.call_success = { pass: callErrors.length === 0, detail: noCallAllowed ? "护栏规则直接判定，无需模型" : "模型调用和逐case计量必须成功" };
  const counts = entry.agent === "vision_dictation" ? dictationCounts({ agent: entry.agent, sample: entry.sample }, output) : { wrongTotal: 0, missedWrong: 0 };
  return { id: entry.sample.id, agent: entry.agent, ...(entry.sample.expected ? { expected: entry.sample.expected } : {}), pass: Object.values(results).every(r => r.pass), checks: results, output, modelOutputs, callErrors, turns, ...counts };
}
export async function runEvaluation(options: RunOptions): Promise<{ report: EvalReport; resultFile: string; privateResultFile?: string }> {
  if (options.agent && !agents.includes(options.agent)) throw new Error("未知Agent");
  if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit < 1)) throw new Error("limit必须是正整数");
  const config = modelConfig(options.config ?? runtimeConfig, options.model);
  const getEnv = options.getEnv ?? (name => process.env[name]);
  const secrets = [...new Set(RUNTIME_AGENTS.map(a => config[a].apiKeyEnv))].map(name => getEnv(name)).filter((s): s is string => Boolean(s));
  const now = options.now ?? Date.now;
  const create = options.createClient ?? (onTurn => createLlmClient({ config, fetch: globalThis.fetch, getEnv, now, onTurn }));
  let entries = options.cases ?? await loadPublicCases(path.join(options.rootDir, "evals/cases"), options.agent);
  const skipped: EvalReport["skipped"] = [];
  if (!options.cases && (!options.agent || options.agent === "vision_dictation")) {
    const privateCases = await loadPrivateCases(path.join(options.rootDir, "data/private/dictation"));
    if (privateCases) entries = [...entries, ...privateCases];
    else skipped.push({ agent: "vision_dictation", reason: "已跳过：私有听写目录不存在（不计为通过）" });
  }
  entries = entries.filter(e => !options.agent || e.agent === options.agent);
  if (options.limit) entries = agents.flatMap(agent => entries.filter(e => e.agent === agent).slice(0, options.limit));
  // 最多4个case；每个case独立创建客户端与onTurn闭包，重试计量不会串账。
  const results: CaseResult[] = new Array(entries.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, entries.length) }, async () => {
    while (cursor < entries.length) {
      const index = cursor++;
      results[index] = await evaluateCase(entries[index]!, create, config);
    }
  }));
  const privateResults = results.filter((_, index) => entries[index]!.private);
  const summaries = agents.flatMap(agent => {
    const group = results.filter(c => c.agent === agent);
    return group.length ? [summarize(agent, group)] : [];
  });
  const report: EvalReport = { version: 1, createdAt: new Date(now()).toISOString(), models: Object.fromEntries(agents.filter(a => !options.agent || a === options.agent).map(a => [a, config[a].model])), completeSuite: !options.agent && !options.limit && !options.cases, summaries, cases: results.filter((_, index) => !entries[index]!.private), skipped, exitCode: summaries.every(s => s.thresholdPassed) ? 0 : 1 };
  const safeReport = redactValue(report, secrets);
  const filename = `${report.createdAt.replace(/[:.]/gu, "-")}-${redact(options.model ?? "configured-models", secrets).replace(/[^a-zA-Z0-9_-]/gu, "_").slice(0, 80)}-${randomUUID()}.json`;
  const resultFile = path.join(options.rootDir, "evals/results", filename);
  await mkdir(path.dirname(resultFile), { recursive: true });
  await writeFile(resultFile, JSON.stringify(safeReport, null, 2) + "\n");
  let privateResultFile: string | undefined;
  if (privateResults.length) {
    privateResultFile = path.join(options.rootDir, "data/private/eval-results", filename);
    await mkdir(path.dirname(privateResultFile), { recursive: true, mode: 0o700 });
    // 已存在的目录不能通过符号链接把逐条私有结果导向公开目录。
    const expectedDirectory = path.join(await realpath(options.rootDir), "data/private/eval-results");
    if (await realpath(path.dirname(privateResultFile)) !== expectedDirectory) throw new Error("私有结果目录不能是符号链接");
    await writeFile(privateResultFile, JSON.stringify(redactValue({ version: 1, createdAt: report.createdAt, cases: privateResults }, secrets), null, 2) + "\n", { mode: 0o600, flag: "wx" });
  }
  (options.print ?? console.log)(redact(formatReport(safeReport, privateResults), secrets));
  // 对外返回的公开报告也去除密钥，避免调用者直接打印未过滤对象。
  return { report: safeReport, resultFile, ...(privateResultFile ? { privateResultFile } : {}) };
}
