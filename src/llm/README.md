# 模型调用层

所有 Agent 都通过 `LlmClient` 调模型，不直接引用任何厂商 SDK。这一层负责按配置选模型、发 `POST {baseUrl}/chat/completions`、校验 JSON、重试、超时和统计 token。

## 创建运行时客户端

```ts
import runtimeConfigJson from "../../config/models.json";
import { loadRuntimeConfig } from "@/llm/config";
import { createLlmClient } from "@/llm/client";

// 启动时执行一次：配置结构不对，或任何一个运行时 Agent 不是 deepseek，这里会直接抛错。
const config = loadRuntimeConfig(runtimeConfigJson);
// createLlmClient 内部会再调用一次 loadRuntimeConfig，手写配置对象也不能绕过红线。

const llm = createLlmClient({
  config,
  fetch: globalThis.fetch,
  getEnv: (name) => process.env[name],
  now: () => Date.now(),
  onTurn: (record) => {
    // record 里只有 Agent、模型、token、耗时和成功标记，没有密钥，也没有孩子原文。
    // 存库、汇总由调用方决定；这里不要写 console.log(record) 之外的孩子数据。
    console.info("llm_turn", record);
  },
});
```

调用时传入契约里的 schema：

```ts
import { CharCoachOutput } from "@/contracts/schemas";

const result = await llm.call({
  agent: "char_coach",
  system: "固定不变的系统规则",
  stablePrefix: "当课内容",
  user: "孩子的本次输入",
  images: [{ url: "https://example.test/homework.jpg" }], // 可选
  schema: CharCoachOutput,
  sessionId: "session-id", // 可选；onTurn 里需要时由调用方闭包捕获
});

if (result.ok) {
  result.data; // 已经通过 schema 校验
} else {
  result.error; // "timeout" | "invalid_output" | "provider_error"
}
```

`call` 永远不抛异常，失败都通过 `ok: false` 返回。`onTurn` 在每次 `call` 结束时恰好调用一次（成功或失败），它自己抛异常会被吞掉，不影响返回值。

## 换模型

只改 `config/models.json`，不要改代码：

- `model`：模型名。
- `baseUrl`：接口地址，末尾有没有 `/` 都可以。
- `timeoutMs`：单次请求超时。
- `apiKeyEnv`：环境变量的名字，不是密钥本身。

**`provider` 必须保持 `"deepseek"`。** `loadRuntimeConfig` 会逐个检查八个运行时 Agent，任何一个不是 `deepseek` 都会拒绝启动。这是保护孩子数据的红线，没有跳过开关。

不要在调用点写死模型名，也不要自己拼请求。需要临时覆盖模型名时（例如评测脚本），复制一份配置对象、只改 `model`，仍然先通过 `loadRuntimeConfig`。

## 在测试里造一个假客户端

测试不要连网、不要真实密钥。可以直接复制这段：

```ts
import type { LlmClient, LlmResult } from "@/contracts/llm";

/** 按顺序返回预先排好的结果；用完后重复最后一个。 */
export function createFakeLlm(...results: Array<LlmResult<unknown>>): LlmClient {
  let index = 0;
  return {
    async call<TOut>(): Promise<LlmResult<TOut>> {
      const result = results[Math.min(index, results.length - 1)];
      index += 1;
      return result as LlmResult<TOut>;
    },
  };
}

// 用法：
const fake = createFakeLlm({
  ok: true,
  data: { say: "先看这个字。", ask: null, next: "wait_child", usedCardFields: ["explain"] },
  model: "fake",
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  latencyMs: 0,
});
```

如果被测代码需要检查 `onTurn`，用 `vi.fn()` 包一个回调即可。真实客户端的单元测试全部用假 `fetch`，不发请求。

## 运行时客户端和离线客户端的区别

| | 运行时 `createLlmClient` | 离线 `createOfflineClient` |
| --- | --- | --- |
| 配置 | `config/models.json` | `config/models.offline.json` |
| 选模型 | 按 `req.agent` 选八个 Agent 之一 | 按 `role` 选 `draft` 或 `review` |
| provider 红线 | 有，`loadRuntimeConfig` 强制 deepseek | 没有，起草可以用 OpenAI |
| 数据 | 接触孩子数据 | 只处理课程、字卡、短文等公开内容 |
| 引用位置 | `app/`、`src/agents/` 等运行时路径 | 只允许 `scripts/content/` |

离线用法：

```ts
import { createOfflineClient } from "@/llm/offline";

const draftLlm = createOfflineClient({
  role: "draft", // 读 models.offline.json 的 draft，默认 OpenAI
  fetch: globalThis.fetch,
  getEnv: (name) => process.env[name],
  now: () => Date.now(),
});

const reviewLlm = createOfflineClient({
  role: "review", // 读 review，默认 DeepSeek
  fetch: globalThis.fetch,
  getEnv: (name) => process.env[name],
  now: () => Date.now(),
});
```

`config/models.offline.json` 里的模型名是占位值，负责人要按自己账号可用的型号填写。离线客户端绝不能在 `app/` 或 `src/agents/` 里引用。

## 超时、重试和统计

- 每次请求用 `AbortController` 限时；超时返回 `timeout`，不重试。
- 网络异常或 5xx：等 500ms 重试一次；仍失败返回 `provider_error`。
- 4xx：不重试，返回 `provider_error`。
- 模型返回的文字不是合法 JSON 或不通过 schema：把模型输出和 zod 问题追加到消息里，重试一次；仍不通过返回 `invalid_output`。
- 上游响应本身无法解析（HTTP 成功但响应体不是合法 JSON，或缺少 `choices[0].message.content`）：按可重试的服务端错误处理，等 500ms 再试一次，仍失败返回 `provider_error`，不会把空内容追加进对话。
- 整个 `call` 的预算上限是 `timeoutMs` 的两倍；第二次请求会在剩余预算内缩短超时，预算不够时不再发请求。
- token 从 `usage.prompt_tokens`、`usage.completion_tokens` 读取；缓存 token 优先 `prompt_cache_hit_tokens`，否则 `prompt_tokens_details.cached_tokens`，都没有就是 0。重试的两次会相加。
- 密钥只通过 `getEnv` 读，只放进请求头 `Authorization`，不会进入请求体、返回值、`onTurn` 记录或错误信息。
- `onTurn` 的记录类型是契约里的 `LlmTurnRecord`；失败时带 `error`，成功时不带。
- `src/llm/internal.ts` 是运行时和离线共用的内部实现，只允许 `client.ts` 和 `offline.ts` 引用；其他路径不要 import。
