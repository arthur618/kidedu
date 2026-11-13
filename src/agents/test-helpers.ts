import type { LlmClient, LlmRequest, LlmResult } from "../contracts/llm";

/** 假客户端只留在本包测试中，不访问网络。 */
export function fakeLlm(output: unknown, error?: "timeout" | "invalid_output" | "provider_error") {
  const requests: LlmRequest<unknown>[] = [];
  const llm: LlmClient = {
    async call<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
      requests.push(request);
      if (error) return { ok: false, error, model: "fake", latencyMs: 0 };
      return { ok: true, data: output as T, model: "fake", latencyMs: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
    },
  };
  return { llm, requests };
}
export const errors = ["timeout", "invalid_output", "provider_error"] as const;
