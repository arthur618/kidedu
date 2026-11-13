import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import runtimeConfigJson from "../../config/models.json";
import type { LlmClientDeps } from "./client";
import type { LlmRequest, ModelConfig } from "../contracts/llm";
import type { AgentName } from "../contracts/schemas";
import { createLlmClient, OUTPUT_ONLY_JSON_SUFFIX } from "./client";

const schema = z.object({ answer: z.string() });

interface FetchCall {
  url: string;
  init: RequestInit;
}

function response(content: string): Response {
  return responseWithUsage(content, { prompt_tokens: 3, completion_tokens: 2 });
}

function responseWithUsage(content: string, usage: Record<string, unknown>): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content } }],
      usage,
    }),
  } as unknown as Response;
}

function fakeFetch(handler: (callIndex: number) => Response | Promise<Response>): {
  fetchImpl: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return handler(calls.length - 1);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function fixtureConfig(): ModelConfig {
  return JSON.parse(JSON.stringify(runtimeConfigJson)) as ModelConfig;
}

function baseRequest(overrides: Partial<LlmRequest<{ answer: string }>> = {}): LlmRequest<{ answer: string }> {
  return {
    agent: "char_coach" as AgentName,
    system: "你是语文老师。",
    stablePrefix: "今天学“休”字。",
    user: "请解释这个字。",
    schema,
    ...overrides,
  };
}

function requestBody(call: FetchCall): Record<string, unknown> {
  return JSON.parse(String(call.init.body)) as Record<string, unknown>;
}

function makeClient(fetchImpl: typeof fetch, overrides: Partial<LlmClientDeps> = {}) {
  return createLlmClient({
    config: fixtureConfig(),
    fetch: fetchImpl,
    getEnv: () => "test-key",
    now: () => 0,
    ...overrides,
  });
}

describe("请求构造", () => {
  it("消息顺序是 system、stablePrefix、user，并自动追加 JSON 约束", async () => {
    const { fetchImpl, calls } = fakeFetch(() => response('{"answer":"ok"}'));
    const client = createLlmClient({
      config: fixtureConfig(),
      fetch: fetchImpl,
      getEnv: () => "test-key",
      now: () => 0,
    });

    const result = await client.call(baseRequest());
    expect(result.ok).toBe(true);

    const body = requestBody(calls[0]!);
    expect(body.model).toBe("deepseek-flash");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages).toEqual([
      { role: "system", content: `你是语文老师。\n${OUTPUT_ONLY_JSON_SUFFIX}` },
      { role: "system", content: "今天学“休”字。" },
      { role: "user", content: "请解释这个字。" },
    ]);
    expect(calls[0]!.url).toBe("https://api.deepseek.com/chat/completions");
    expect(calls[0]!.init.method).toBe("POST");
  });

  it("没有 stablePrefix 时只有两条消息", async () => {
    const { fetchImpl, calls } = fakeFetch(() => response('{"answer":"ok"}'));
    const client = createLlmClient({
      config: fixtureConfig(),
      fetch: fetchImpl,
      getEnv: () => "test-key",
      now: () => 0,
    });

    await client.call(baseRequest({ stablePrefix: undefined }));

    const messages = requestBody(calls[0]!).messages as unknown[];
    expect(messages).toHaveLength(2);
    expect(messages.map((message) => (message as { role: string }).role)).toEqual(["system", "user"]);
  });

  it("有图片时 user 内容依次是文字块和每张图的 image_url 块", async () => {
    const { fetchImpl, calls } = fakeFetch(() => response('{"answer":"ok"}'));
    const client = createLlmClient({
      config: fixtureConfig(),
      fetch: fetchImpl,
      getEnv: () => "test-key",
      now: () => 0,
    });

    await client.call(
      baseRequest({
        user: "看看这张作业。",
        images: [{ url: "https://example.test/a.png" }, { url: "https://example.test/b.png" }],
      }),
    );

    const messages = requestBody(calls[0]!).messages as Array<{ role: string; content: unknown }>;
    expect(messages[0]!.role).toBe("system");
    expect(messages[1]!.role).toBe("system");
    expect(messages[2]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "看看这张作业。" },
        { type: "image_url", image_url: { url: "https://example.test/a.png" } },
        { type: "image_url", image_url: { url: "https://example.test/b.png" } },
      ],
    });
  });

  it("同一 system 和 stablePrefix、不同 user 的两次调用，前两条消息逐字节相同", async () => {
    const { fetchImpl, calls } = fakeFetch(() => response('{"answer":"ok"}'));
    const client = createLlmClient({
      config: fixtureConfig(),
      fetch: fetchImpl,
      getEnv: () => "test-key",
      now: () => 0,
    });

    await client.call(baseRequest({ user: "第一个问题" }));
    await client.call(baseRequest({ user: "第二个问题" }));

    const firstMessages = (requestBody(calls[0]!).messages as unknown[]).slice(0, 2);
    const secondMessages = (requestBody(calls[1]!).messages as unknown[]).slice(0, 2);
    expect(JSON.stringify(secondMessages)).toBe(JSON.stringify(firstMessages));
  });

  it("即使 baseUrl 末尾有斜杠也只拼出一个 /chat/completions", async () => {
    const config = fixtureConfig();
    config.char_coach.baseUrl = "https://api.deepseek.com/";
    const { fetchImpl, calls } = fakeFetch(() => response('{"answer":"ok"}'));
    const client = createLlmClient({
      config,
      fetch: fetchImpl,
      getEnv: () => "test-key",
      now: () => 0,
    });

    await client.call(baseRequest());
    expect(calls[0]!.url).toBe("https://api.deepseek.com/chat/completions");
  });
});

describe("请求构造（纯函数）", () => {
  it("stripCodeFence 只去掉整段包裹", async () => {
    const { stripCodeFence } = await import("./client");
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripCodeFence('```\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripCodeFence('  {"a":1}  ')).toBe('{"a":1}');
  });
});

describe("输出解析与 schema 重试", () => {
  it("模型返回被 ``` 包裹的 JSON 时能正确解析", async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      response('```json\n{"answer":"包在代码块里"}\n```'),
    );
    const client = makeClient(fetchImpl);

    const result = await client.call(baseRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("应当成功");
    expect(result.data).toEqual({ answer: "包在代码块里" });
    expect(calls).toHaveLength(1);
  });

  it("第一次不合 schema、第二次合：成功，fetch 两次，token 两次之和", async () => {
    const { fetchImpl, calls } = fakeFetch((index) =>
      index === 0
        ? responseWithUsage('{"answer":123}', {
            prompt_tokens: 10,
            completion_tokens: 2,
            prompt_cache_hit_tokens: 4,
          })
        : responseWithUsage('{"answer":"修正了"}', {
            prompt_tokens: 20,
            completion_tokens: 3,
            prompt_cache_hit_tokens: 6,
          }),
    );
    const client = makeClient(fetchImpl);

    const result = await client.call(baseRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("应当成功");
    expect(result.data).toEqual({ answer: "修正了" });
    expect(result.inputTokens).toBe(30);
    expect(result.cachedInputTokens).toBe(10);
    expect(result.outputTokens).toBe(5);
    expect(calls).toHaveLength(2);

    const retryMessages = requestBody(calls[1]!).messages as Array<{
      role: string;
      content: string;
    }>;
    expect(retryMessages[3]).toEqual({ role: "assistant", content: '{"answer":123}' });
    expect(retryMessages[4]!.role).toBe("user");
    expect(retryMessages[4]!.content).toContain("你的输出不符合要求：");
    expect(retryMessages[4]!.content).toContain("请只输出修正后的 JSON。");
  });

  it("两次都不合 schema：返回 invalid_output，fetch 恰好两次", async () => {
    const { fetchImpl, calls } = fakeFetch(() => response('{"answer":0}'));
    const client = makeClient(fetchImpl);

    const result = await client.call(baseRequest());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("应当失败");
    expect(result.error).toBe("invalid_output");
    expect(calls).toHaveLength(2);
  });
});

describe("超时与错误处理", () => {
  it("请求超时：返回 timeout，fetch 只被调一次，不等待重试", async () => {
    const config = fixtureConfig();
    config.char_coach.timeoutMs = 20;
    const sleep = vi.fn(async () => {});
    const { fetchImpl, calls } = fakeFetch(() => new Promise<Response>(() => {}));
    const client = makeClient(fetchImpl, { config, now: () => Date.now(), sleep });

    const result = await client.call(baseRequest());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("应当超时");
    expect(result.error).toBe("timeout");
    expect(calls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("5xx 等 500 毫秒重试一次后成功", async () => {
    const sleep = vi.fn(async () => {});
    const { fetchImpl, calls } = fakeFetch((index) =>
      index === 0
        ? ({ ok: false, status: 503, json: async () => ({}) } as unknown as Response)
        : response('{"answer":"第二次成功"}'),
    );
    const client = makeClient(fetchImpl, { sleep });

    const result = await client.call(baseRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("应当成功");
    expect(result.data).toEqual({ answer: "第二次成功" });
    expect(calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it("5xx 连续两次：返回 provider_error，fetch 两次", async () => {
    const sleep = vi.fn(async () => {});
    const { fetchImpl, calls } = fakeFetch(
      () => ({ ok: false, status: 502, json: async () => ({}) }) as unknown as Response,
    );
    const client = makeClient(fetchImpl, { sleep });

    const result = await client.call(baseRequest());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("应当失败");
    expect(result.error).toBe("provider_error");
    expect(calls).toHaveLength(2);
  });

  it("4xx 不重试", async () => {
    const sleep = vi.fn(async () => {});
    const { fetchImpl, calls } = fakeFetch(
      () => ({ ok: false, status: 401, json: async () => ({}) }) as unknown as Response,
    );
    const client = makeClient(fetchImpl, { sleep });

    const result = await client.call(baseRequest());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("应当失败");
    expect(result.error).toBe("provider_error");
    expect(calls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("fetch 抛异常时 call 不抛异常，网络错误重试一次后返回 provider_error", async () => {
    const sleep = vi.fn(async () => {});
    const { fetchImpl, calls } = fakeFetch(() => {
      throw new Error("network down");
    });
    const client = makeClient(fetchImpl, { sleep });

    await expect(client.call(baseRequest())).resolves.toMatchObject({
      ok: false,
      error: "provider_error",
    });
    expect(calls).toHaveLength(2);
  });

  it("总时长上限内才重试：剩余预算不足 500ms 时不再发第二次请求", async () => {
    const config = fixtureConfig();
    config.char_coach.timeoutMs = 100;
    const sleep = vi.fn(async () => {});
    let clock = 0;
    const { fetchImpl, calls } = fakeFetch(() => {
      clock = 150;
      return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
    });
    const client = makeClient(fetchImpl, { config, now: () => clock, sleep });

    const result = await client.call(baseRequest());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("应当失败");
    expect(result.error).toBe("provider_error");
    expect(calls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(clock).toBeLessThanOrEqual(config.char_coach.timeoutMs * 2);
  });
});

describe("token 统计与 onTurn", () => {
  const usageCases: Array<[string, Record<string, unknown>, number]> = [
    [
      "DeepSeek 的 prompt_cache_hit_tokens",
      { prompt_tokens: 10, prompt_cache_hit_tokens: 4, completion_tokens: 2 },
      4,
    ],
    [
      "OpenAI 的 prompt_tokens_details.cached_tokens",
      { prompt_tokens: 10, prompt_tokens_details: { cached_tokens: 6 }, completion_tokens: 2 },
      6,
    ],
    ["没有缓存字段", { prompt_tokens: 10, completion_tokens: 2 }, 0],
  ];

  it.each(usageCases)("%s 时 cachedInputTokens 取值正确", async (_name, usage, expected) => {
    const { fetchImpl } = fakeFetch(() => responseWithUsage('{"answer":"ok"}', usage));
    const client = makeClient(fetchImpl);

    const result = await client.call(baseRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("应当成功");
    expect(result.inputTokens).toBe(10);
    expect(result.cachedInputTokens).toBe(expected);
    expect(result.outputTokens).toBe(2);
  });

  it("DeepSeek 和 OpenAI 两种缓存字段同时存在时，优先用 DeepSeek 的", async () => {
    const { fetchImpl } = fakeFetch(() =>
      responseWithUsage('{"answer":"ok"}', {
        prompt_tokens: 10,
        prompt_cache_hit_tokens: 3,
        prompt_tokens_details: { cached_tokens: 9 },
        completion_tokens: 2,
      }),
    );
    const client = makeClient(fetchImpl);

    const result = await client.call(baseRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("应当成功");
    expect(result.cachedInputTokens).toBe(3);
  });

  it("每次成功的 call 恰好调一次 onTurn，记录字段齐全", async () => {
    let clock = 0;
    const now = () => {
      clock += 250;
      return clock;
    };
    const onTurn = vi.fn();
    const { fetchImpl } = fakeFetch(() => response('{"answer":"ok"}'));
    const client = makeClient(fetchImpl, { now, onTurn });

    const result = await client.call(baseRequest());

    expect(result.ok).toBe(true);
    expect(onTurn).toHaveBeenCalledTimes(1);
    expect(onTurn).toHaveBeenCalledWith({
      agent: "char_coach",
      model: "deepseek-flash",
      inputTokens: 3,
      cachedInputTokens: 0,
      outputTokens: 2,
      latencyMs: 500,
      ok: true,
    });
  });

  it("失败的 call 也恰好调一次 onTurn，并带上两次重试的 token 合计", async () => {
    const onTurn = vi.fn();
    const { fetchImpl } = fakeFetch(() =>
      responseWithUsage('{"answer":false}', {
        prompt_tokens: 5,
        prompt_cache_hit_tokens: 1,
        completion_tokens: 2,
      }),
    );
    const client = makeClient(fetchImpl, { onTurn });

    const result = await client.call(baseRequest());

    expect(result.ok).toBe(false);
    expect(onTurn).toHaveBeenCalledTimes(1);
    expect(onTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "char_coach",
        inputTokens: 10,
        cachedInputTokens: 2,
        outputTokens: 4,
        ok: false,
      }),
    );
  });

  it("onTurn 抛异常不影响 call 的返回", async () => {
    const { fetchImpl } = fakeFetch(() => response('{"answer":"ok"}'));
    const client = makeClient(fetchImpl, {
      onTurn: () => {
        throw new Error("统计回调坏了");
      },
    });

    const result = await client.call(baseRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("应当成功");
    expect(result.data).toEqual({ answer: "ok" });
  });

  it("缺少密钥时也调一次 onTurn，返回 provider_error", async () => {
    const onTurn = vi.fn();
    const { fetchImpl, calls } = fakeFetch(() => response('{"answer":"ok"}'));
    const client = makeClient(fetchImpl, { getEnv: () => undefined, onTurn });

    const result = await client.call(baseRequest());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("应当失败");
    expect(result.error).toBe("provider_error");
    expect(calls).toHaveLength(0);
    expect(onTurn).toHaveBeenCalledTimes(1);
    expect(onTurn).toHaveBeenCalledWith(
      expect.objectContaining({ agent: "char_coach", model: "deepseek-flash", ok: false }),
    );
  });
});

describe("密钥不泄露", () => {
  const secret = "sk-test-SECRET-9f8e7d6c5b4a";

  it("密钥只出现在 Authorization 请求头，不出现在 URL、请求体、结果或 onTurn 记录里", async () => {
    const onTurn = vi.fn();
    const { fetchImpl, calls } = fakeFetch(() => response('{"answer":"ok"}'));
    const client = makeClient(fetchImpl, { getEnv: () => secret, onTurn });

    const result = await client.call(baseRequest());

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).not.toContain(secret);
    expect(String(init.body)).not.toContain(secret);
    expect(JSON.stringify(init.headers)).toContain(secret);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${secret}`);
    expect(JSON.stringify(result)).not.toContain(secret);

    expect(onTurn).toHaveBeenCalledTimes(1);
    const record = onTurn.mock.calls[0]![0] as Record<string, unknown>;
    expect(JSON.stringify(record)).not.toContain(secret);
  });

  it("失败返回的任何错误信息都不包含密钥", async () => {
    const onTurn = vi.fn();
    const { fetchImpl, calls } = fakeFetch(() => response('{"answer":false}'));
    const client = makeClient(fetchImpl, { getEnv: () => secret, onTurn });

    const result = await client.call(baseRequest());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("应当失败");
    expect(result.error).toBe("invalid_output");
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.error).not.toContain(secret);
    expect(calls).toHaveLength(2);
    expect(JSON.stringify(onTurn.mock.calls[0]![0])).not.toContain(secret);
  });
});
