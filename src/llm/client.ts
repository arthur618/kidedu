/**
 * 运行时模型客户端。
 * createLlmClient 自己会重新校验配置和 provider 红线，调用方不能靠“忘了先校验”绕过去。
 */
import type { LlmClient, LlmTurnRecord, ModelConfig } from "../contracts/llm";
import { loadRuntimeConfig } from "./config";
import { createRouteClient } from "./internal";

export interface LlmClientDeps {
  config: ModelConfig;
  fetch: typeof fetch;
  getEnv: (name: string) => string | undefined;
  now: () => number;
  onTurn?: (record: LlmTurnRecord) => void;
  /** 测试里可以替换掉真实的 500ms 等待。 */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * 创建运行时客户端。传入的配置会再次经过 loadRuntimeConfig：
 * 结构不合法或任何一个运行时 Agent 不是 deepseek 都会在这里同步抛错。
 */
export function createLlmClient(deps: LlmClientDeps): LlmClient {
  const config = loadRuntimeConfig(deps.config);

  return createRouteClient({
    getRoute: (agent) => config[agent],
    fetch: deps.fetch,
    getEnv: deps.getEnv,
    now: deps.now,
    onTurn: deps.onTurn,
    sleep: deps.sleep,
  });
}
