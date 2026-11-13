/**
 * 契约文件：模型调用层的接口。实现见任务 D2。
 * 版本 2.1（2026-11-13）：增加 LlmTurnRecord。
 * 所有 Agent 只通过 LlmClient 调模型，不直接引用任何厂商 SDK。
 */
import type { z } from "zod";
import type { AgentName } from "./schemas";

export interface LlmImage {
  url: string;
}

export interface LlmRequest<TOut> {
  agent: AgentName;
  /** 固定不变的系统规则，放最前面以命中缓存。 */
  system: string;
  /** 当课内容等半固定部分，紧跟 system。 */
  stablePrefix?: string;
  /** 本次调用的可变部分（孩子信息、历史、当前输入）。 */
  user: string;
  images?: LlmImage[];
  /** 输出必须通过这个 schema，否则重试一次。 */
  schema: z.ZodType<TOut>;
  sessionId?: string;
}

export type LlmResult<TOut> =
  | {
      ok: true;
      data: TOut;
      model: string;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      latencyMs: number;
    }
  | {
      ok: false;
      /** timeout: 超过 8 秒；invalid_output: 重试后仍不符合 schema；provider_error: 其他。 */
      error: "timeout" | "invalid_output" | "provider_error";
      model: string;
      latencyMs: number;
    };

export interface LlmClient {
  call<TOut>(req: LlmRequest<TOut>): Promise<LlmResult<TOut>>;
}

/** 每次 call 结束时交给调用方的记录（成功或失败都有）。调用方用它写 Turn 表。不含密钥和请求内容。 */
export interface LlmTurnRecord {
  agent: AgentName;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  latencyMs: number;
  ok: boolean;
  /** 失败时的原因，成功时不带。 */
  error?: "timeout" | "invalid_output" | "provider_error";
}

/** config/models.json 的结构：每个 Agent 用哪个模型。换模型只改这个文件。 */
export interface ModelRoute {
  provider: "deepseek" | "openai";
  model: string;
  baseUrl: string;
  apiKeyEnv: string;
  timeoutMs: number;
}
export type ModelConfig = Record<AgentName, ModelRoute>;

/**
 * 运行时（接触孩子数据）的 Agent 只允许 provider = "deepseek"。
 * D2 的实现必须在启动时校验这一条，违反则拒绝启动。
 */
export const RUNTIME_AGENTS: AgentName[] = [
  "vision_homework",
  "vision_dictation",
  "char_coach",
  "reader",
  "essay",
  "guard",
  "score",
  "report",
];

/** 语音转文字。M1 可以不接，认读走 self_report 模式。 */
export interface SpeechToText {
  transcribe(audio: Uint8Array, hint?: { expectedText?: string }): Promise<{ text: string; pinyin: string[] } | null>;
}
