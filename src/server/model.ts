import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { LlmClient, LlmRequest, LlmResult, LlmTurnRecord } from "../contracts/llm";
import type { Turn } from "../contracts/schemas";
import { SESSION_SERVER_BUDGET_MS } from "../contracts/session";
import { insertTurn } from "../db/turn";

interface Operation { deadline: number; abort: AbortController; photos: string[] }
interface CallCapture { record?: LlmTurnRecord }
const operation = new AsyncLocalStorage<Operation>();
const capture = new AsyncLocalStorage<CallCapture>();
export interface ModelOptions {
  nowMs: () => number;
  modelName?: (agent: LlmRequest<unknown>["agent"]) => string;
  setTimer: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
}
export const defaultModelOptions: ModelOptions = { nowMs: Date.now, setTimer: setTimeout, clearTimer: clearTimeout };
export function captureTurn(record: LlmTurnRecord): void { const target = capture.getStore(); if (target) target.record = record; }
/** 所有真实 fetch 都绑定当前操作的总预算；D2 的单调用超时仍生效。 */
export const budgetFetch: typeof fetch = (input, init) => {
  const current = operation.getStore();
  if (current?.abort.signal.aborted) return Promise.reject(new Error("operation_timeout"));
  const signal = current ? (init?.signal ? AbortSignal.any([init.signal, current.abort.signal]) : current.abort.signal) : init?.signal;
  return fetch(input, { ...init, signal });
};
export function redact(value: unknown, photos: string[] = operation.getStore()?.photos ?? []): unknown {
  if (typeof value === "string") {
    let safe = value;
    for (const photo of photos) {
      safe = safe.split(photo).join("<image>");
      const payload = photo.split(",")[1];
      if (payload) safe = safe.split(payload).join("<image>");
    }
    return safe.replace(/data:image\/[^\s"'<>]+/g, "<image>");
  }
  if (Array.isArray(value)) return value.map(item => redact(item, photos));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item, photos)]));
  return value;
}
export async function withinBudget<T>(options: ModelOptions, photos: string[], run: () => Promise<T>): Promise<T> {
  const current: Operation = { deadline: options.nowMs() + SESSION_SERVER_BUDGET_MS, abort: new AbortController(), photos };
  const timer = options.setTimer(() => current.abort.abort(), SESSION_SERVER_BUDGET_MS);
  try { return await operation.run(current, run); }
  finally { current.abort.abort(); options.clearTimer(timer); }
}
export interface PendingTurn { request: LlmRequest<unknown>; result: LlmResult<unknown>; record?: LlmTurnRecord }
/** 这里只竞速无副作用的模型结果。迟到结果不能执行任何数据库写入或状态推进。 */
export function measuredClient(base: LlmClient, options: ModelOptions, turns: PendingTurn[]): LlmClient {
  return { async call<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
    const current = operation.getStore();
    if (current && (current.abort.signal.aborted || options.nowMs() >= current.deadline)) {
      return { ok: false, error: "timeout", model: options.modelName?.(request.agent) ?? "budget", latencyMs: 0 };
    }
    const slot: CallCapture = {};
    const startedAt = options.nowMs();
    const elapsed = () => Math.max(0, Math.round(options.nowMs() - startedAt));
    const timedOut = (): LlmResult<T> => ({ ok: false, error: "timeout", model: options.modelName?.(request.agent) ?? "budget", latencyMs: elapsed() });
    let listener: (() => void) | undefined;
    const stopped = new Promise<LlmResult<T>>(resolve => {
      if (current) { listener = () => resolve(timedOut()); current.abort.signal.addEventListener("abort", listener, { once: true }); }
    });
    let result: LlmResult<T>;
    try {
      const pending = capture.run(slot, () => base.call(request)).catch((): LlmResult<T> => ({ ok: false, error: "provider_error", model: options.modelName?.(request.agent) ?? "unavailable", latencyMs: elapsed() }));
      result = current ? await Promise.race([pending, stopped]) : await pending;
    } finally { if (listener) current?.abort.signal.removeEventListener("abort", listener); }
    turns.push({ request: redact({ ...request, schema: undefined }) as LlmRequest<unknown>, result: redact(result) as LlmResult<unknown>, record: slot.record });
    return result.ok ? { ...result, data: redact(result.data) as T } : result;
  } };
}
/** 明确 await 存库，避免 D2/Agent 吞掉 onTurn 抛错。 */
export async function persistTurns(sessionId: string, turns: PendingTurn[], verdict: Turn["guardVerdict"], now: () => Date): Promise<void> {
  for (const { request, result, record } of turns.splice(0)) {
    await insertTurn({ id: `turn_${randomUUID()}`, sessionId, agent: request.agent,
      model: record?.model ?? result.model, input: redact(request), output: redact(result),
      inputTokens: record?.inputTokens ?? (result.ok ? result.inputTokens : 0),
      cachedInputTokens: record?.cachedInputTokens ?? (result.ok ? result.cachedInputTokens : 0),
      outputTokens: record?.outputTokens ?? (result.ok ? result.outputTokens : 0),
      latencyMs: Math.max(record?.latencyMs ?? 0, result.latencyMs),
      guardVerdict: request.agent === "guard" ? "skipped" : verdict, createdAt: now().toISOString() });
  }
}
