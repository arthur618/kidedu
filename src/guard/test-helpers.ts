import { vi } from "vitest";
import type { LlmClient, LlmRequest, LlmResult } from "../contracts/llm";
import type { GuardInput } from "../contracts/schemas";

export function input(candidate: string, context: GuardInput["context"] = "essay"): GuardInput {
  return { agent: context === "char" ? "char_coach" : context === "reading" ? "reader" : "essay", context, candidate };
}

export function success(data: unknown): LlmResult<unknown> {
  return { ok: true, data, model: "fake", inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, latencyMs: 0 };
}

export function fakeLlm(result: LlmResult<unknown> = success({ verdict: "pass", reason: "none" })) {
  const call = vi.fn(async (_request: LlmRequest<unknown>): Promise<LlmResult<unknown>> => result);
  const llm: LlmClient = {
    async call<TOut>(request: LlmRequest<TOut>): Promise<LlmResult<TOut>> {
      return await call(request) as LlmResult<TOut>;
    },
  };
  return { llm, call };
}
