import type { AgentName, GuardInput } from "../src/contracts/schemas";
import type { LlmTurnRecord } from "../src/contracts/llm";

export const agents = ["char_coach", "reader", "essay", "guard", "vision_homework", "vision_dictation"] as const;
export type EvalAgent = typeof agents[number];
export interface EvalCase {
  id: string;
  input: unknown;
  checks: string[];
  note: string;
  expected?: "pass" | "blocked";
  shouldEscalate?: boolean;
  tags?: string[];
  sourceFixture?: string;
  extra?: { usedCardFields?: string[]; childLastUtterance?: string; keyPoints?: string[] };
  /** 私有听写错字标注；位置以expectedWords数组和词内字符下标确定。 */
  wrongCharacters?: Array<{ wordIndex: number; charIndex: number }>;
}
export interface CheckInput { agent: EvalAgent; sample: EvalCase }
export interface CheckResult { pass: boolean; detail: string }
export type Check = (input: CheckInput, output: unknown) => CheckResult;
export interface CaseResult {
  id: string;
  agent: EvalAgent;
  pass: boolean;
  expected?: "pass" | "blocked";
  checks: Record<string, CheckResult>;
  output: unknown;
  /** 公共契约可获得的成功data，不声称是供应商原始文本。 */
  modelOutputs: unknown[];
  callErrors: string[];
  turns: LlmTurnRecord[];
  wrongTotal: number;
  missedWrong: number;
}
export interface AgentSummary {
  agent: EvalAgent;
  count: number;
  passed: number;
  passRate: number;
  averageLatencyMs: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  checks: Record<string, { passed: number; total: number; rate: number }>;
  thresholdPassed: boolean;
  thresholdFailures: string[];
  falseNegatives?: number;
  falsePositives?: number;
  wrongTotal?: number;
  missedWrong?: number;
}
export interface EvalReport {
  version: 1;
  createdAt: string;
  models: Partial<Record<AgentName, string>>;
  completeSuite: boolean;
  summaries: AgentSummary[];
  /** 仅公开编造样例；私有听写逐条结果另存gitignore目录。 */
  cases: CaseResult[];
  skipped: Array<{ agent: EvalAgent; reason: string }>;
  exitCode: 0 | 1;
}
export type GuardCaseInput = GuardInput;
