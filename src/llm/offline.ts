/**
 * 离线内容生产专用的模型客户端。
 * 这个客户端只给 scripts/content/ 用，不能在 app/ 和 src/agents/ 里引用。
 * 它不执行运行时“provider 必须是 deepseek”的红线检查，因为不接触孩子数据。
 */
import { z } from "zod";
import offlineConfigJson from "../../config/models.offline.json";
import type { LlmClient, LlmTurnRecord, ModelRoute } from "../contracts/llm";
import { modelRouteSchema } from "./config";
import { createRouteClient } from "./internal";

export type OfflineRole = "draft" | "review";

export interface OfflineConfig {
  draft: ModelRoute;
  review: ModelRoute;
}

export interface OfflineClientDeps {
  /** draft 用起草模型，review 用另一家模型的审校。 */
  role: OfflineRole;
  fetch: typeof fetch;
  getEnv: (name: string) => string | undefined;
  now: () => number;
  onTurn?: (record: LlmTurnRecord) => void;
  sleep?: (ms: number) => Promise<void>;
}

const offlineConfigSchema = z
  .object({
    draft: modelRouteSchema,
    review: modelRouteSchema,
  })
  .strict();

/**
 * 校验离线配置。只校验结构，不校验 provider：起草允许 OpenAI。
 * Runtime 的 provider 红线只在 loadRuntimeConfig 里执行。
 */
export function loadOfflineConfig(json: unknown): OfflineConfig {
  const parsed = offlineConfigSchema.safeParse(json);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("；");
    throw new Error(`离线模型配置格式不正确：${details}`);
  }
  return parsed.data;
}

/**
 * 创建一个离线客户端。每次调用都用 deps.role 选中的那条路由：
 * - role: "draft" 读 config/models.offline.json 的 draft；
 * - role: "review" 读 review。
 *
 * 用法见 src/llm/README.md。它不校验运行时红线，也绝不能接触孩子数据。
 */
export function createOfflineClient(deps: OfflineClientDeps): LlmClient {
  const config = loadOfflineConfig(offlineConfigJson);
  const route = config[deps.role];

  return createRouteClient({
    getRoute: () => route,
    fetch: deps.fetch,
    getEnv: deps.getEnv,
    now: deps.now,
    onTurn: deps.onTurn,
    sleep: deps.sleep,
  });
}
