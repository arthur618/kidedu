import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import configJson from "../../config/models.json";
import type { LlmTurnRecord, ModelConfig } from "../contracts/llm";
import { createLlmClient } from "./client";
import { loadRuntimeConfig } from "./config";
import { createOfflineClient, loadOfflineConfig } from "./offline";

const schema = z.object({ answer: z.string() });
const req = { agent: "char_coach" as const, system: "编造规则", stablePrefix: "编造固定资料", user: "编造问题", schema };
const usage = { prompt_tokens: 13, prompt_cache_hit_tokens: 5, completion_tokens: 7 };
function config(): ModelConfig { return structuredClone(configJson) as ModelConfig; }
function completion(finish: unknown = "stop", message: Record<string, unknown> = { content: '{"answer":"ok"}' }) {
  return { choices: [{ finish_reason: finish, message }], usage };
}
function harness(payloads: unknown[], routes = config()) {
  const bodies: Array<Record<string, unknown>> = [];
  const records: LlmTurnRecord[] = [];
  const sleep = vi.fn(async () => {});
  const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify(payloads[Math.min(bodies.length - 1, payloads.length - 1)]));
  }) as unknown as typeof fetch;
  const client = createLlmClient({ config: routes, fetch: fetchImpl, getEnv: () => "fictional-token", now: () => 0, sleep, onTurn: record => records.push(record) });
  return { client, bodies, records, sleep, fetchImpl };
}
afterEach(() => vi.useRealTimers());

describe("DeepSeek预算与审核", () => {
  it.each([undefined, {}, { thinking: "disabled", maxTokens: 1 }, { thinking: "enabled", maxTokens: 8192 }] as const)("缺省和显式选项 %j 首次/纠正请求共用预算与审核", async options => {
    const routes = config();
    routes.char_coach.deepseek = options;
    const h = harness([completion("stop", { content: " " }), completion()], routes);
    expect(await h.client.call(req)).toMatchObject({ ok: true, inputTokens: 26, cachedInputTokens: 10, outputTokens: 14 });
    expect(h.bodies).toHaveLength(2);
    for (const body of h.bodies) {
      expect(body).toMatchObject({ stream: false, thinking: { type: options?.thinking ?? "disabled" }, max_tokens: options?.maxTokens ?? 1024, safety_check: { level: "high" }, response_format: { type: "text" } });
      expect(body).not.toHaveProperty("tools"); expect(body).not.toHaveProperty("tool_choice");
    }
    const first = h.bodies[0]!.messages as unknown[];
    const second = h.bodies[1]!.messages as unknown[];
    expect(second.slice(0, 3)).toEqual(first);
    expect(second[3]).toEqual({ role: "assistant", content: " " });
    expect(h.records).toHaveLength(1);
  });
  it("八个Agent明确非思考和有限预算", () => {
    const routes = loadRuntimeConfig(configJson);
    expect(Object.fromEntries(Object.entries(routes).map(([agent, route]) => [agent, route.deepseek]))).toEqual(Object.fromEntries(Object.entries({ vision_homework: 2048, vision_dictation: 4096, char_coach: 512, reader: 512, essay: 1024, guard: 256, score: 256, report: 1024 }).map(([agent, maxTokens]) => [agent, { thinking: "disabled", maxTokens }])));
  });
  it.each([{ maxTokens: 0 }, { maxTokens: 8193 }, { maxTokens: 1.5 }, { maxTokens: "512" }, { thinking: "auto" }, { max_tokens: 512 }, { tools: [] }, null])("非法DeepSeek选项 %j 启动拒绝", options => {
    const routes = config();
    (routes.char_coach as unknown as Record<string, unknown>).deepseek = options;
    expect(() => loadRuntimeConfig(routes)).toThrow(/deepseek/);
  });
  it("OpenAI配置拒绝DeepSeek选项，实际离线请求无专有字段", async () => {
    const route = { ...config().char_coach, provider: "openai", baseUrl: "https://api.openai.com/v1" };
    expect(() => loadOfflineConfig({ draft: route, review: route })).toThrow(/deepseek/);
    const h = harness([completion()]);
    const client = createOfflineClient({ role: "draft", fetch: h.fetchImpl, getEnv: () => "fictional-token", now: () => 0 });
    expect(await client.call(req)).toMatchObject({ ok: true });
    for (const key of ["thinking", "max_tokens", "safety_check", "tools"]) expect(h.bodies[0]).not.toHaveProperty(key);
  });
});

describe("完成原因与拒答", () => {
  it.each(["length", "content_filter", "tool_calls", "insufficient_system_resource", "aborted", "future_reason", null, undefined])("结束原因 %s 即使JSON合法也失败且不重试", async finish => {
    const payload = completion(finish);
    if (finish === undefined) delete (payload.choices[0] as Record<string, unknown>).finish_reason;
    const h = harness([payload]);
    expect(await h.client.call(req)).toMatchObject({ ok: false, error: "provider_error" });
    expect(h.bodies).toHaveLength(1); expect(h.sleep).not.toHaveBeenCalled();
    expect(h.records).toEqual([expect.objectContaining({ inputTokens: 13, cachedInputTokens: 5, outputTokens: 7, ok: false })]);
  });
  it.each([undefined, null, "", " \n "])("stop且refusal为%j接受，reasoning_content不进入输出或记录", async refusal => {
    const h = harness([completion("stop", { content: '{"answer":"ok"}', refusal, reasoning_content: "fictional-hidden-reasoning" })]);
    const result = await h.client.call(req);
    expect(result).toMatchObject({ ok: true, data: { answer: "ok" } });
    expect(JSON.stringify([result, h.records, h.bodies])).not.toContain("fictional-hidden-reasoning");
  });
  it.each(["拒答原文", 1, false, {}, []])("refusal异常或非空%j不重试，不泄漏拒答/思考原文", async refusal => {
    const h = harness([completion("stop", { content: '{"answer":"ok"}', refusal, reasoning_content: "fictional-hidden-reasoning" })]);
    const result = await h.client.call(req);
    expect(result).toMatchObject({ ok: false, error: "provider_error" });
    expect(h.bodies).toHaveLength(1); expect(h.sleep).not.toHaveBeenCalled();
    expect(JSON.stringify([result, h.records])).not.toMatch(/拒答原文|fictional-hidden-reasoning/);
  });
  it.each(["tool_calls", "server_tool_calls", "function_call"])("stop带%s仍拒绝且不执行工具", async key => {
    const h = harness([completion("stop", { content: '{"answer":"ok"}', [key]: [{ id: "fictional-tool" }] })]);
    expect(await h.client.call(req)).toMatchObject({ ok: false }); expect(h.bodies).toHaveLength(1);
  });
  it("stop持续空白最多纠正一次，reasoning不能作为候选", async () => {
    const h = harness([completion("stop", { content: "\n ", reasoning_content: '{"answer":"wrong"}' })]);
    expect(await h.client.call(req)).toMatchObject({ ok: false, error: "invalid_output" });
    expect(h.bodies).toHaveLength(2); expect(h.records[0]).toMatchObject({ inputTokens: 26, outputTokens: 14 });
    expect(JSON.stringify(h.bodies)).not.toContain("wrong");
  });
  it("先schema错误后拒答仍累计两次官方缓存计量", async () => {
    const rejected = completion("content_filter");
    const payload = { ...rejected, usage: { prompt_tokens: 20, prompt_tokens_details: { cached_tokens: 9 }, completion_tokens: 4 } };
    const h = harness([completion("stop", { content: "{}" }), payload]);
    expect(await h.client.call(req)).toMatchObject({ ok: false, error: "provider_error" });
    expect(h.records[0]).toMatchObject({ inputTokens: 33, cachedInputTokens: 14, outputTokens: 11 });
    expect(h.bodies).toHaveLength(2);
  });
  it("失败缺usage时记录0，且不宣称免费", async () => {
    const h = harness([{ choices: [{ finish_reason: "content_filter", message: { content: "" } }] }]);
    await h.client.call(req);
    expect(h.records[0]).toMatchObject({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, ok: false });
  });
});

describe("HTTP失败和取消", () => {
  it.each([400, 401, 403, 429, 500])("HTTP %i 保留usage，重试次数有界", async status => {
    const records: LlmTurnRecord[] = [];
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ usage }), { status }));
    const sleep = vi.fn(async () => {});
    const client = createLlmClient({ config: config(), fetch: fetchImpl, getEnv: () => "fictional-token", now: () => 0, sleep, onTurn: record => records.push(record) });
    expect(await client.call(req)).toMatchObject({ ok: false, error: "provider_error" });
    const attempts = status >= 500 ? 2 : 1;
    expect(fetchImpl).toHaveBeenCalledTimes(attempts);
    expect(records[0]).toMatchObject({ inputTokens: 13 * attempts, cachedInputTokens: 5 * attempts, outputTokens: 7 * attempts });
  });
  it("原生AbortError不重试", async () => {
    const fetchImpl = vi.fn(async () => { throw new DOMException("aborted", "AbortError"); });
    const sleep = vi.fn(async () => {});
    const client = createLlmClient({ config: config(), fetch: fetchImpl, getEnv: () => "fictional-token", now: () => 0, sleep });
    expect(await client.call(req)).toMatchObject({ ok: false, error: "provider_error" });
    expect(fetchImpl).toHaveBeenCalledTimes(1); expect(sleep).not.toHaveBeenCalled();
  });
  it("读取响应体期间AbortError不转为JSON故障重试", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new DOMException("aborted", "AbortError"); } }) as unknown as Response);
    const sleep = vi.fn(async () => {});
    const client = createLlmClient({ config: config(), fetch: fetchImpl, getEnv: () => "fictional-token", now: () => 0, sleep });
    expect(await client.call(req)).toMatchObject({ ok: false, error: "provider_error" });
    expect(fetchImpl).toHaveBeenCalledTimes(1); expect(sleep).not.toHaveBeenCalled();
  });
  it("超时后迟到的合法stop不成功、不补记onTurn", async () => {
    vi.useFakeTimers();
    let resolve!: (response: Response) => void;
    const records: LlmTurnRecord[] = [];
    const routes = config(); routes.char_coach.timeoutMs = 10;
    const client = createLlmClient({ config: routes, fetch: vi.fn(() => new Promise<Response>(done => { resolve = done; })), getEnv: () => "fictional-token", now: () => 0, onTurn: record => records.push(record) });
    const pending = client.call(req);
    await vi.advanceTimersByTimeAsync(10);
    expect(await pending).toMatchObject({ ok: false, error: "timeout" });
    resolve(new Response(JSON.stringify(completion())));
    await vi.advanceTimersByTimeAsync(1);
    expect(records).toHaveLength(1); expect(records[0]).toMatchObject({ ok: false, error: "timeout" });
  });
  it.each([undefined, "", "   "])("无密钥%j零网络", async key => {
    const fetchImpl = vi.fn();
    const client = createLlmClient({ config: config(), fetch: fetchImpl, getEnv: () => key, now: () => 0 });
    expect(await client.call(req)).toMatchObject({ ok: false, error: "provider_error" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// 按已观察到的供应商约束模拟协议端点；只接受text与high组合，不访问网络。
function protocolServer(contents: string[]) {
  const bodies: Array<Record<string, unknown>> = [];
  let accepted = 0;
  const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    bodies.push(body);
    if (JSON.stringify(body.response_format) !== JSON.stringify({ type: "text" }) ||
        JSON.stringify(body.safety_check) !== JSON.stringify({ level: "high" })) {
      return new Response(JSON.stringify({ error: { type: "invalid_request_error" } }), { status: 400 });
    }
    const content = contents[Math.min(accepted++, contents.length - 1)]!;
    return new Response(JSON.stringify(completion("stop", { content })));
  });
  const client = createLlmClient({ config: config(), fetch: fetchImpl, getEnv: () => "fictional-token", now: () => 0 });
  return { client, fetchImpl, bodies };
}

describe("D2C text与high协议端点回归", () => {
  it("假服务器拒绝旧json_object/high，真实客户端出站text/high合法JSON成功", async () => {
    const h = protocolServer(['{"answer":"ok"}']);
    const old = await h.fetchImpl("https://synthetic.invalid/chat/completions", { body: JSON.stringify({ response_format: { type: "json_object" }, safety_check: { level: "high" } }) });
    expect(old.status).toBe(400);
    expect(await h.client.call(req)).toMatchObject({ ok: true, data: { answer: "ok" } });
    expect(h.bodies).toHaveLength(2);
    expect(h.bodies[1]).toMatchObject({ response_format: { type: "text" }, safety_check: { level: "high" }, stream: false, thinking: { type: "disabled" }, max_tokens: 512 });
    expect(h.bodies[1]).not.toHaveProperty("tools");
  });
  it.each(["不是JSON", " \n", '{"answer":12}'])("text候选%j经原校验纠正后成功，首次与纠正均兼容端点", async content => {
    const h = protocolServer([content, '{"answer":"ok"}']);
    expect(await h.client.call(req)).toMatchObject({ ok: true, data: { answer: "ok" }, inputTokens: 26, outputTokens: 14 });
    expect(h.bodies).toHaveLength(2);
    for (const body of h.bodies) expect(body).toMatchObject({ response_format: { type: "text" }, safety_check: { level: "high" }, stream: false, thinking: { type: "disabled" }, max_tokens: 512 });
    expect((h.bodies[1]!.messages as unknown[])[3]).toEqual({ role: "assistant", content });
  });
  it.each(["不是JSON", " \n", '{"answer":12}'])("text候选%j持续非法最多两次，不能绕过JSON或schema", async content => {
    const h = protocolServer([content]);
    expect(await h.client.call(req)).toMatchObject({ ok: false, error: "invalid_output" });
    expect(h.fetchImpl).toHaveBeenCalledTimes(2);
  });
});
