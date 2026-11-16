/**
 * 模型调用层的内部实现。
 * 只允许 src/llm/client.ts 和 src/llm/offline.ts 引用这个文件；其他路径不要 import。
 * 不直接读取环境变量、不直接取当前时间、不直接使用全局 fetch，全部由 deps 注入，方便测试。
 */
import type { z } from "zod";
import type {
  LlmClient,
  LlmRequest,
  LlmResult,
  LlmTurnRecord,
  ModelRoute,
} from "../contracts/llm";
import { DeepSeekOptionsSchema } from "../contracts/llm";
import type { AgentName } from "../contracts/schemas";

export const OUTPUT_ONLY_JSON_SUFFIX = "只输出一个 JSON 对象，不要输出其他任何文字。";
const RETRY_DELAY_MS = 500;

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
  response_format: { type: "text" | "json_object" };
  stream?: false;
  thinking?: { type: "disabled" | "enabled" };
  max_tokens?: number;
  safety_check?: { level: "high" };
}

type HttpOutcome =
  | { kind: "success"; text: string; usage: TokenUsage }
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

/** 只有完整结束、无拒答、无工具调用时才允许解析候选；其他结束不收费重试。 */
function readCompletion(payload: unknown): HttpOutcome {
  const usage = readUsage(payload);
  const root = asRecord(payload);
  const choices = root?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return { kind: "retryable", usage };
  const first = asRecord(choices[0]);
  if (!first || first.finish_reason !== "stop") return { kind: "fatal", usage };
  const message = asRecord(first.message);
  if (!message) return { kind: "fatal", usage };
  const refusal = message.refusal;
  if (refusal !== undefined && refusal !== null &&
      (typeof refusal !== "string" || refusal.trim() !== "")) return { kind: "fatal", usage };
  // 即使上游错误地标成stop，也不接收带有工具行为的候选，更不执行工具。
  for (const key of ["tool_calls", "server_tool_calls", "function_call"]) {
    const calls = message[key];
    if (calls !== undefined && calls !== null && !(Array.isArray(calls) && calls.length === 0)) {
      return { kind: "fatal", usage };
    }
  }
  if (typeof message.content !== "string") return { kind: "fatal", usage };
  return { kind: "success", text: message.content, usage };
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
  messages: ChatMessage[] = buildMessages(req),
): ChatRequestBody {
  const options = DeepSeekOptionsSchema.parse(route.deepseek ?? {});
  return {
    model: route.model,
    messages,
    response_format: { type: route.provider === "deepseek" ? "text" : "json_object" },
    ...(route.provider === "deepseek" ? {
      stream: false as const,
      thinking: { type: options.thinking ?? "disabled" },
      max_tokens: options.maxTokens ?? 1024,
      safety_check: { level: "high" as const },
    } : {}),
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

function isAborted(error: unknown, signal: AbortSignal): boolean {
  // operation_timeout是既有服务端budgetFetch在操作预算耗尽时的拒绝。
  return signal.aborted || (error instanceof Error &&
    (error.name === "AbortError" || error.message === "operation_timeout"));
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

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error) {
        return { kind: !isAborted(error, controller.signal) && (response.ok || response.status >= 500) ? "retryable" : "fatal", usage: emptyUsage() };
      }
      if (!response.ok) {
        return { kind: response.status >= 500 ? "retryable" : "fatal", usage: readUsage(payload) };
      }
      return readCompletion(payload);
    } catch (error) {
      const aborted = isAborted(error, controller.signal);
      return { kind: aborted ? "fatal" : "retryable", usage: emptyUsage() };
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

    const requestBody = buildRequestBody(req, route, messages);

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
        const record: LlmTurnRecord = {
          agent: req.agent,
          model,
          inputTokens: outcome.usage.inputTokens,
          cachedInputTokens: outcome.usage.cachedInputTokens,
          outputTokens: outcome.usage.outputTokens,
          latencyMs,
          ok: outcome.ok,
        };
        if (!outcome.ok) record.error = outcome.error;
        deps.onTurn?.(record);
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
