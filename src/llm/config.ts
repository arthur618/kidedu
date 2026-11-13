/**
 * 读取并校验模型配置。
 * 这里有一条产品红线：运行时 Agent 的 provider 只能是 deepseek，没有跳过开关。
 */
import { z } from "zod";
import { RUNTIME_AGENTS, type ModelConfig } from "../contracts/llm";

export const modelRouteSchema = z.object({
  provider: z.enum(["deepseek", "openai"]),
  model: z.string().min(1),
  baseUrl: z.string().url(),
  apiKeyEnv: z.string().min(1),
  timeoutMs: z.number().int().positive(),
});

/** 八个运行时 Agent 都必须显式配置，多出来的键会被拒绝。 */
export const modelConfigSchema = z
  .object({
    vision_homework: modelRouteSchema,
    vision_dictation: modelRouteSchema,
    char_coach: modelRouteSchema,
    reader: modelRouteSchema,
    essay: modelRouteSchema,
    guard: modelRouteSchema,
    score: modelRouteSchema,
    report: modelRouteSchema,
  })
  .strict();

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("；");
}

/**
 * 校验 models.json。结构不合法会抛错；任何运行时 Agent 不是 deepseek 也会抛错。
 * 错误信息会写明是哪个 Agent，方便负责人直接改配置。
 */
export function loadRuntimeConfig(json: unknown): ModelConfig {
  const parsed = modelConfigSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`模型配置格式不正确：${formatZodError(parsed.error)}`);
  }

  const config = parsed.data as ModelConfig;
  for (const agent of RUNTIME_AGENTS) {
    const route = config[agent];
    if (route.provider !== "deepseek") {
      throw new Error(
        `运行时 Agent "${agent}" 的 provider 必须是 "deepseek"，当前为 "${route.provider}"。` +
          "孩子的数据不能发送到境外模型。",
      );
    }
  }

  return config;
}
