import thresholds from "./thresholds.json";
import type { AgentSummary, CaseResult, EvalAgent, EvalReport } from "./types";

export function summarize(agent: EvalAgent, cases: CaseResult[]): AgentSummary {
  const turns = cases.flatMap(c => c.turns);
  const checks: AgentSummary["checks"] = {};
  for (const sample of cases) for (const [name, check] of Object.entries(sample.checks)) {
    const aggregate = checks[name] ?? { passed: 0, total: 0, rate: 0 };
    aggregate.total++; aggregate.passed += Number(check.pass); aggregate.rate = aggregate.passed / aggregate.total;
    checks[name] = aggregate;
  }
  const failures: string[] = [];
  // 任何调用错误都不能借Agent兜底或宽松业务阈值取得模型过线记录。
  if (checks.call_success?.rate !== 1) failures.push("call_success需要100%");
  if (agent === "guard") {
    const falseNegatives = cases.filter(c => c.expected === "blocked" && (c.output as { verdict?: string })?.verdict !== "blocked").length;
    const falsePositives = cases.filter(c => c.expected === "pass" && (c.output as { verdict?: string })?.verdict !== "pass").length;
    if (falseNegatives > thresholds.guard.maxFalseNegatives) failures.push(`漏拦${falseNegatives}条，上限2条`);
    if (falsePositives > thresholds.guard.maxFalsePositives) failures.push(`误拦${falsePositives}条，上限10条`);
    if (checks.schema?.rate !== 1) failures.push("schema需要100%");
  } else if (agent === "vision_dictation") {
    const total = cases.reduce((n, c) => n + c.wrongTotal, 0);
    const missed = cases.reduce((n, c) => n + c.missedWrong, 0);
    if (total > 0 && missed / total > thresholds.vision_dictation.maxMissedWrongRate) failures.push("错字漏标率超过2%");
    if (checks.schema?.rate !== 1) failures.push("schema需要100%");
  } else {
    const threshold = thresholds[agent];
    for (const [name, check] of Object.entries(checks)) {
      if (name === "call_success") continue;
      const minimum = (threshold.checks as Record<string, number>)[name] ?? threshold.other;
      if (check.rate < minimum) failures.push(`${name}低于${minimum * 100}%`);
    }
  }
  const summary: AgentSummary = {
    agent, count: cases.length, passed: cases.filter(c => c.pass).length,
    passRate: cases.length ? cases.filter(c => c.pass).length / cases.length : 0,
    averageLatencyMs: cases.length ? turns.reduce((n, t) => n + t.latencyMs, 0) / cases.length : 0,
    inputTokens: turns.reduce((n, t) => n + t.inputTokens, 0), cachedInputTokens: turns.reduce((n, t) => n + t.cachedInputTokens, 0),
    outputTokens: turns.reduce((n, t) => n + t.outputTokens, 0), checks, thresholdPassed: failures.length === 0, thresholdFailures: failures,
  };
  if (agent === "guard") {
    summary.falseNegatives = cases.filter(c => c.expected === "blocked" && (c.output as { verdict?: string })?.verdict !== "blocked").length;
    summary.falsePositives = cases.filter(c => c.expected === "pass" && (c.output as { verdict?: string })?.verdict !== "pass").length;
  }
  if (agent === "vision_dictation") {
    summary.wrongTotal = cases.reduce((n, c) => n + c.wrongTotal, 0);
    summary.missedWrong = cases.reduce((n, c) => n + c.missedWrong, 0);
  }
  return summary;
}
/** 只读取配置指定的密钥，不扫描环境或其他密钥位置。所有持久化和终端出口共用。 */
export function redact(text: string, secrets: readonly string[]): string {
  return [...new Set(secrets.filter(Boolean))].sort((a, b) => b.length - a.length).reduce((value, secret) => value.split(secret).join("[已隐藏]"), text);
}
export function redactValue<T>(value: T, secrets: readonly string[]): T {
  if (typeof value === "string") return redact(value, secrets) as T;
  if (Array.isArray(value)) return value.map(item => redactValue(item, secrets)) as T;
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [redact(key, secrets), redactValue(item, secrets)])) as T;
  return value;
}
export function formatReport(report: EvalReport, privateCases: CaseResult[] = []): string {
  const lines = ["Agent  样例  通过  通过率  平均耗时  输入token  缓存命中  输出token"];
  for (const s of report.summaries) lines.push(`${s.agent}  ${s.count}  ${s.passed}  ${(s.passRate * 100).toFixed(1)}%  ${(s.averageLatencyMs / 1000).toFixed(2)}s  ${s.inputTokens}  ${s.cachedInputTokens}  ${s.outputTokens}${s.thresholdPassed ? "" : "  未过线：" + s.thresholdFailures.join("、")}`);
  for (const skip of report.skipped) lines.push(`${skip.agent}：${skip.reason}`);
  if (!report.completeSuite) lines.push("这是筛选/限量运行，不能视为全量过线证据。");
  for (const c of report.cases.filter(c => !c.pass)) {
    lines.push(`${c.agent}/${c.id} 未通过：${Object.entries(c.checks).filter(([, r]) => !r.pass).map(([n]) => n).join("、")}`);
    lines.push(`调用错误：${c.callErrors.join("、") || "无"}`);
    lines.push(`Agent最终输出：${JSON.stringify(c.output)}`);
    lines.push(`可获得的模型成功data（非供应商raw）：${JSON.stringify(c.modelOutputs)}`);
    if (c.callErrors.length) lines.push("公共LlmClient未提供失败响应的供应商原始文本。");
  }
  privateCases.forEach((c, index) => { if (!c.pass) lines.push(`vision_dictation/私有-${String(index + 1).padStart(4, "0")} 未通过：${Object.entries(c.checks).filter(([, r]) => !r.pass).map(([n]) => n).join("、")}`); });
  return lines.join("\n");
}
