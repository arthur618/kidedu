import { describe, expect, it } from "vitest";
import { z } from "zod";
import offlineConfigJson from "../../config/models.offline.json";
import type { LlmRequest } from "../contracts/llm";
import { createOfflineClient, loadOfflineConfig } from "./offline";

const schema = z.object({ answer: z.string() });

function response(content: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }),
  } as unknown as Response;
}

function fakeFetch(): {
  fetchImpl: typeof fetch;
  calls: Array<{ url: string; body: Record<string, unknown> }>;
} {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return response('{"answer":"ok"}');
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function request(): LlmRequest<{ answer: string }> {
  return {
    agent: "char_coach",
    system: "离线起草",
    user: "写一张字卡",
    schema,
  };
}

describe("loadOfflineConfig", () => {
  it("接受 openai 的 draft 和 deepseek 的 review，不做运行时红线检查", () => {
    const config = loadOfflineConfig(offlineConfigJson);
    expect(config.draft.provider).toBe("openai");
    expect(config.review.provider).toBe("deepseek");
    expect(config.draft.baseUrl).toBe("https://api.openai.com/v1");
    expect(config.draft.timeoutMs).toBe(60000);
    expect(config.review.timeoutMs).toBe(60000);
    expect(config.draft.baseUrl.endsWith("/v1")).toBe(true);
  });

  it("即使两条都是 openai 也能通过，因为离线层不受运行时红线约束", () => {
    const config = JSON.parse(JSON.stringify(offlineConfigJson)) as Record<string, unknown>;
    config.draft = { ...(config.draft as object), provider: "openai" };
    config.review = { ...(config.review as object), provider: "openai" };
    expect(() => loadOfflineConfig(config)).not.toThrow();
  });

  it("结构不合法时抛错", () => {
    expect(() => loadOfflineConfig({ draft: {} })).toThrow(/离线模型配置格式不正确/);
  });
});

describe("createOfflineClient", () => {
  it("draft 角色请求 OpenAI 的地址和 draft 模型", async () => {
    const { fetchImpl, calls } = fakeFetch();
    const client = createOfflineClient({
      role: "draft",
      fetch: fetchImpl,
      getEnv: () => "offline-key",
      now: () => 0,
    });

    const result = await client.call(request());

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(calls[0]!.url.endsWith("/v1/chat/completions")).toBe(true);
    expect(calls[0]!.body.model).toBe(offlineConfigJson.draft.model);
  });

  it("review 角色请求 DeepSeek 的地址和 review 模型", async () => {
    const { fetchImpl, calls } = fakeFetch();
    const client = createOfflineClient({
      role: "review",
      fetch: fetchImpl,
      getEnv: () => "offline-key",
      now: () => 0,
    });

    const result = await client.call(request());

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.deepseek.com/chat/completions");
    expect(calls[0]!.body.model).toBe(offlineConfigJson.review.model);
  });

  it("离线客户端不因 draft 的 provider 是 openai 而拒绝调用", async () => {
    const { fetchImpl, calls } = fakeFetch();
    const client = createOfflineClient({
      role: "draft",
      fetch: fetchImpl,
      getEnv: () => "offline-key",
      now: () => 0,
    });

    await expect(client.call(request())).resolves.toMatchObject({ ok: true });
    expect(calls).toHaveLength(1);
  });
});
