/**
 * 模型调用层的核心实现。
 * 不直接读取环境变量、不直接取当前时间、不直接使用全局 fetch，全部由 deps 注入，方便测试。
 */
import type { z } from "zod";
import type { LlmClient, LlmRequest, LlmResult, ModelConfig, ModelRoute } from "../contracts/llm";
import type { AgentName } from "../contracts/schemas";

export const OUTPUT_ONLY_JSON_SUFFIX = "只输出一个 JSON 对象，不要输出其他任何文字。";
const RETRY_DELAY_MS = 500;

export interface LlmTurnRecord {
  agent: AgentName;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  latencyMs: number;
  ok: boolean;
}

export interface LlmClientDeps {
  config: ModelConfig;
  fetch: typeof fetch;
  getEnv: (name: string) => string | undefined;
  now: () => number;
  onTurn?: (record: LlmTurnRecord) => void;
  /** 测试里可以替换掉真实的 500ms 等待。 */
  sleep?: (ms: number) => Promise<void>;
}

export interface RouteClientDeps {
  getRoute: (agent: AgentName) => ModelRoute | undefined;
  fetch: typeof fetch;
  getEnv: (name: string) => string | undefined;
  now: () => number;
  onTurn?: (record: LlmTurnRecord) => void;
  sleep?: (ms: number) => Promise<void>;
}

interface TokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

type ChatRole = "system" | "user" | "assistant";
export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };
export type ChatMessage = { role: ChatRole; content: string | ChatContentPart[] };

interface ChatRequestBody {
  model: string;
  messages: ChatMessage[];
  response_format: { type: "json_object" };
}

type HttpOutcome =
  | { kind: "success"; text: string; usage: TokenUsage }
  | { kind: "invalid_response"; rawText: string; problem: string; usage: TokenUsage }
  | { kind: "timeout"; usage: TokenUsage }
  | { kind: "retryable"; usage: TokenUsage }
  | { kind: "fatal"; usage: TokenUsage };

type InternalResult<TOut> =
  | { ok: true; data: TOut; usage: TokenUsage }
  | { ok: false; error: "timeout" | "invalid_output" | "provider_error"; usage: TokenUsage };

function emptyUsage(): TokenUsage {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
}

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readToken(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Math.trunc(value);
}

/** 按 DeepSeek 优先、OpenAI 兜底的顺序读缓存 token。 */
function readUsage(payload: unknown): TokenUsage {
  const root = asRecord(payload);
  const usage = root ? asRecord(root.usage) : null;
  if (!usage) return emptyUsage();

  const details = asRecord(usage.prompt_tokens_details);
  const cached =
    readToken(usage.prompt_cache_hit_tokens) ??
    (details ? readToken(details.cached_tokens) : undefined) ??
    0;

  return {
    inputTokens: readToken(usage.prompt_tokens) ?? 0,
    cachedInputTokens: cached,
    outputTokens: readToken(usage.completion_tokens) ?? 0,
  };
}

function readCompletion(payload: unknown): { text: string; usage: TokenUsage } | null {
  const root = asRecord(payload);
  if (!root) return null;
  const choices = root.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = asRecord(choices[0]);
  if (!first) return null;
  const message = asRecord(first.message);
  if (!message || typeof message.content !== "string") return null;
  return { text: message.content, usage: readUsage(payload) };
}

/** 去掉模型常见的 ``` 或 ```json 包裹，其他文字原样保留。 */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```$/i.exec(trimmed);
  if (!match) return trimmed;
  return (match[1] ?? "").trim();
}

/** 请求体里的消息顺序是 system、可选的 stablePrefix、user。 */
export function buildMessages(
  req: Pick<LlmRequest<unknown>, "system" | "stablePrefix" | "user" | "images">,
): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: "system", content: `${req.system}\n${OUTPUT_ONLY_JSON_SUFFIX}` },
  ];

  if (req.stablePrefix !== undefined) {
    messages.push({ role: "system", content: req.stablePrefix });
  }

  const images = req.images ?? [];
  if (images.length > 0) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: req.user },
        ...images.map((image) => ({ type: "image_url" as const, image_url: { url: image.url } })),
      ],
    });
  } else {
    messages.push({ role: "user", content: req.user });
  }

  return messages;
}

export function buildRequestBody(
  req: Pick<LlmRequest<unknown>, "system" | "stablePrefix" | "user" | "images">,
  route: ModelRoute,
): ChatRequestBody {
  return {
    model: route.model,
    messages: buildMessages(req),
    response_format: { type: "json_object" },
  };
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("；");
}

function validateText<TOut>(
  text: string,
  schema: z.ZodType<TOut>,
): { ok: true; data: TOut } | { ok: false; problem: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch (error) {
    const message = error instanceof Error ? error.message : "JSON 解析失败";
    return { ok: false, problem: `不是合法 JSON（${message}）` };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, problem: describeIssues(result.error) };
  }
  return { ok: true, data: result.data };
}

function appendCorrection(
  messages: ChatMessage[],
  rawText: string,
  problem: string,
): ChatMessage[] {
  return [
    ...messages,
    { role: "assistant", content: rawText },
    {
      role: "user",
      content: `你的输出不符合要求：${problem}。请只输出修正后的 JSON。`,
    },
  ];
}

async function sendOnce(args: {
  route: ModelRoute;
  apiKey: string;
  body: ChatRequestBody;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<HttpOutcome> {
  const url = `${args.route.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const requestPromise = (async (): Promise<HttpOutcome> => {
    try {
      const response = await args.fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${args.apiKey}`,
        },
        body: JSON.stringify(args.body),
        signal: controller.signal,
      });

      if (!response.ok) {
        return response.status >= 500
          ? { kind: "retryable", usage: emptyUsage() }
          : { kind: "fatal", usage: emptyUsage() };
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return {
          kind: "invalid_response",
          rawText: "",
          problem: "返回内容不是合法 JSON",
          usage: emptyUsage(),
        };
      }

      const completion = readCompletion(payload);
      if (!completion) {
        return {
          kind: "invalid_response",
          rawText: "",
          problem: "返回内容里没有 choices[0].message.content",
          usage: readUsage(payload),
        };
      }

      return { kind: "success", text: completion.text, usage: completion.usage };
    } catch {
      return { kind: "retryable", usage: emptyUsage() };
    }
  })();

  const timeoutPromise = new Promise<HttpOutcome>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: "timeout", usage: emptyUsage() });
    }, args.timeoutMs);
  });

  try {
    return await Promise.race([requestPromise, timeoutPromise]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function runCall<TOut>(
  req: LlmRequest<TOut>,
  route: ModelRoute | undefined,
  deps: RouteClientDeps,
  startedAt: number,
): Promise<InternalResult<TOut>> {
  let usage = emptyUsage();
  if (!route) return { ok: false, error: "provider_error", usage };
  if (!Number.isFinite(route.timeoutMs) || route.timeoutMs <= 0) {
    return { ok: false, error: "provider_error", usage };
  }

  let apiKey: string | undefined;
  try {
    apiKey = deps.getEnv(route.apiKeyEnv);
  } catch {
    apiKey = undefined;
  }
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    return { ok: false, error: "provider_error", usage };
  }

  const deadline = startedAt + route.timeoutMs * 2;
  let messages = buildMessages(req);

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const remaining = deadline - deps.now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      return { ok: false, error: "timeout", usage };
    }

    const requestBody: ChatRequestBody = {
      model: route.model,
      messages,
      response_format: { type: "json_object" },
    };

    const outcome = await sendOnce({
      route,
      apiKey: apiKey.trim(),
      body: requestBody,
      timeoutMs: Math.min(route.timeoutMs, remaining),
      fetchImpl: deps.fetch,
    });
    usage = addUsage(usage, outcome.usage);

    if (outcome.kind === "success") {
      const validation = validateText(outcome.text, req.schema);
      if (validation.ok) {
        return { ok: true, data: validation.data, usage };
      }
      if (attempt === 2) {
        return { ok: false, error: "invalid_output", usage };
      }
      messages = appendCorrection(messages, outcome.text, validation.problem);
      continue;
    }

    if (outcome.kind === "invalid_response") {
      if (attempt === 2) {
        return { ok: false, error: "invalid_output", usage };
      }
      messages = appendCorrection(messages, outcome.rawText, outcome.problem);
      continue;
    }

    if (outcome.kind === "timeout") {
      return { ok: false, error: "timeout", usage };
    }

    if (outcome.kind === "fatal" || attempt === 2) {
      return { ok: false, error: "provider_error", usage };
    }

    const beforeWait = deadline - deps.now();
    if (!Number.isFinite(beforeWait) || beforeWait <= RETRY_DELAY_MS) {
      return { ok: false, error: "provider_error", usage };
    }
    await (deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(
      RETRY_DELAY_MS,
    );
  }

  return { ok: false, error: "provider_error", usage };
}

function safeNow(deps: { now: () => number }): number {
  try {
    const value = deps.now();
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

/** 运行时客户端：从已经通过红线校验的配置里取路由。 */
export function createLlmClient(deps: LlmClientDeps): LlmClient {
  return createRouteClient({
    getRoute: (agent) => deps.config[agent],
    fetch: deps.fetch,
    getEnv: deps.getEnv,
    now: deps.now,
    onTurn: deps.onTurn,
    sleep: deps.sleep,
  });
}

/**
 * 按 Agent 现取路由的核心客户端，供运行时和离线两处复用。
 * 它本身不校验 provider；运行时红线在 loadRuntimeConfig 里完成。
 */
export function createRouteClient(deps: RouteClientDeps): LlmClient {
  return {
    async call<TOut>(req: LlmRequest<TOut>): Promise<LlmResult<TOut>> {
      const startedAt = safeNow(deps);
      let route: ModelRoute | undefined;
      let outcome: InternalResult<TOut>;
      try {
        route = deps.getRoute(req.agent);
        outcome = await runCall(req, route, deps, startedAt);
      } catch {
        outcome = { ok: false, error: "provider_error", usage: emptyUsage() };
      }

      const endedAt = safeNow(deps);
      const latencyMs = Math.max(0, Math.round(endedAt - startedAt));
      const model = route?.model ?? "";

      try {
        deps.onTurn?.({
          agent: req.agent,
          model,
          inputTokens: outcome.usage.inputTokens,
          cachedInputTokens: outcome.usage.cachedInputTokens,
          outputTokens: outcome.usage.outputTokens,
          latencyMs,
          ok: outcome.ok,
        });
      } catch {
        // onTurn 是调用方的统计回调，不能影响模型调用结果。
      }

      if (outcome.ok) {
        return {
          ok: true,
          data: outcome.data,
          model,
          inputTokens: outcome.usage.inputTokens,
          cachedInputTokens: outcome.usage.cachedInputTokens,
          outputTokens: outcome.usage.outputTokens,
          latencyMs,
        };
      }

      return { ok: false, error: outcome.error, model, latencyMs };
    },
  };
}
