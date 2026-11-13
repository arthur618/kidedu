import { reduce, advanceChar, planDay, initContext } from "../orchestrator";
import { getChild } from "../db/child";
import { getChildChar, listChildChars, upsertChildChar } from "../db/childChar";
import { getLesson } from "../db/lesson";
import { createSession, getSession, updateSession } from "../db/session";
import { getSessionRuntime, saveSessionRuntime } from "../db/sessionRuntime";
import { getCharCard, getCharCards } from "../db/charCard";
import { createLlmClient } from "../llm/client";
import { loadRuntimeConfig } from "../llm/config";
import configJson from "../../config/models.json" with { type: "json" };
import type { LlmClient, ModelConfig } from "../contracts/llm";
import type { ServerDeps } from "./session";
import { budgetFetch, captureTurn, defaultModelOptions, type ModelOptions } from "./model";
export { reduce, advanceChar, planDay, initContext };
export interface RuntimeDeps extends ServerDeps {
  llm: LlmClient;
  getCharCard: typeof getCharCard;
  getCharCards: typeof getCharCards;
  modelOptions: ModelOptions;
  /** 测试故障注入：状态已提交、效果尚未执行。生产不设置。 */
  afterCheckpoint?: () => Promise<void>;
  /** 测试故障注入：coach与完成记录同一事务内。 */
  beforeComplete?: () => Promise<void>;
}
export function createServerDeps(options: { config?: ModelConfig; llm?: LlmClient; now?: () => Date; modelOptions?: Partial<ModelOptions> } = {}): RuntimeDeps {
  const config = loadRuntimeConfig(options.config ?? configJson);
  const modelOptions = { ...defaultModelOptions, modelName: (agent: keyof ModelConfig) => config[agent].model, ...options.modelOptions };
  const llm = options.llm ?? createLlmClient({ config, fetch: budgetFetch, getEnv: name => process.env[name], now: modelOptions.nowMs, onTurn: captureTurn });
  return { reduce, advanceChar, planDay, initContext, now: options.now ?? (() => new Date()),
    getChild, getLesson, listChildChars, getChildChar, upsertChildChar, createSession, getSession, updateSession,
    getSessionRuntime, saveSessionRuntime, getCharCard, getCharCards, llm, modelOptions };
}
/** 每个 Node 进程创建一次真实客户端；模型配置不合法立即拒绝启动。 */
export const serverDeps = createServerDeps();
