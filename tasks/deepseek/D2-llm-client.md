# D2 模型调用层

- 交给：DeepSeek harness
- 批次：第一批，可立即开始
- 分支：`task/D2`
- 允许修改的路径：`src/llm/`、`config/`

开工前先读：`AGENTS.md`、`docs/ARCHITECTURE.md`、`src/contracts/llm.ts`、`src/contracts/schemas.ts`。

## 目标

实现 `src/contracts/llm.ts` 里的 `LlmClient` 接口。所有 Agent 都通过它调模型。它负责：按配置选模型、发请求、校验输出结构、重试、超时、统计 token。

## 按顺序做

### 第 1 步：配置文件

新建 `config/models.json`，结构是契约里的 `ModelConfig`。八个 Agent 都要有一项，初始值全部是：

```json
{ "provider": "deepseek", "model": "deepseek-flash", "baseUrl": "https://api.deepseek.com", "apiKeyEnv": "DEEPSEEK_API_KEY", "timeoutMs": 8000 }
```

再新建 `config/models.offline.json`，给离线内容生产用，里面两项：`draft`（provider 为 openai）和 `review`（provider 为 deepseek）。模型名先写占位值，在文件旁的 `config/README.md` 说明由负责人按自己账号可用的型号填写。

### 第 2 步：读配置并校验

`src/llm/config.ts`：

- `loadRuntimeConfig(json)`：用 zod 校验结构。然后检查契约里 `RUNTIME_AGENTS` 列出的每个 Agent，`provider` 必须是 `"deepseek"`。有任何一个不是，就抛出错误，错误信息里写明是哪个 Agent。
- 这条检查是产品的红线：孩子的数据不能发到境外模型。不要提供任何跳过它的开关。

### 第 3 步：发请求

`src/llm/client.ts` 导出 `createLlmClient(deps): LlmClient`。`deps` 里有：配置、`fetch`、`getEnv(name)`、`now()`、可选的 `onTurn(record)` 回调。全部从外面传入，方便测试。

DeepSeek 和 OpenAI 的对话接口格式相同，都是 `POST {baseUrl}/chat/completions`。请求体：

- `model`：配置里的模型名。
- `messages`：
  1. `{ role: "system", content: req.system }`
  2. 如果有 `stablePrefix`：`{ role: "system", content: req.stablePrefix }`
  3. `{ role: "user", content: ... }`：没有图片时是字符串 `req.user`；有图片时是数组，先放一个文字块，再每张图一个 `image_url` 块。
- `response_format: { type: "json_object" }`。
- 在 `system` 末尾自动加一句：“只输出一个 JSON 对象，不要输出其他任何文字。”

顺序不能变。前两条消息不变时厂商会缓存它们，这是省钱的关键。

### 第 4 步：解析和校验输出

1. 取返回里第一条消息的文字。
2. 如果文字被 ``` 包住，去掉包裹。
3. `JSON.parse`，再用 `req.schema.safeParse` 校验。
4. 通过就返回 `ok: true`。
5. 不通过就重试一次：在原来的消息后面追加模型刚才的输出和一条用户消息，“你的输出不符合要求：<zod 报的问题>。请只输出修正后的 JSON。”
6. 第二次还不通过，返回 `ok: false, error: "invalid_output"`。

### 第 5 步：超时和错误

- 每次请求用 `AbortController` 限时，时长取配置里的 `timeoutMs`。超时返回 `error: "timeout"`，不重试。
- 网络错误或状态码 5xx：等 500 毫秒重试一次，仍失败返回 `error: "provider_error"`。
- 状态码 4xx：不重试，返回 `error: "provider_error"`。
- `call` 永远不抛异常，所有失败都用 `ok: false` 返回。
- 整个 `call`（含重试）的总时长不超过 `timeoutMs` 的两倍。

### 第 6 步：统计

从返回的 `usage` 里取 token 数：

- `inputTokens`：`prompt_tokens`
- `cachedInputTokens`：优先取 `prompt_cache_hit_tokens`，没有就取 `prompt_tokens_details.cached_tokens`，都没有就是 0
- `outputTokens`：`completion_tokens`

重试时把两次的 token 数加起来。每次 `call` 结束（成功或失败）调一次 `onTurn`，传入 Agent 名、模型、token 数、耗时、是否成功。`onTurn` 抛异常时吞掉，不影响返回。

### 第 7 步：离线用的客户端

`src/llm/offline.ts` 导出 `createOfflineClient(deps)`，读 `config/models.offline.json`，不做第 2 步的 provider 检查。在文件顶部用注释写明：这个客户端只给 `scripts/content/` 用，不能在 `app/` 和 `src/agents/` 里引用。

### 第 8 步：写说明

`src/llm/README.md`：怎么创建客户端，怎么换模型，怎么在测试里造一个假客户端（给一段可以直接复制的代码），运行时和离线两个客户端的区别。

## 验收标准

每条至少一个测试。全部用假的 `fetch`，不发真实请求。

1. 运行时配置里把任意一个 Agent 的 provider 改成 `openai`，`loadRuntimeConfig` 抛错，错误信息包含那个 Agent 的名字。对八个 Agent 逐个测。
2. 请求体里消息的顺序是 system、stablePrefix、user；没有 `stablePrefix` 时只有两条。
3. 有图片时 user 消息的内容是数组，包含文字块和 `image_url` 块。
4. 同一个 `system` 和 `stablePrefix`、不同 `user` 的两次调用，发出的前两条消息逐字节相同。
5. 模型返回被 ``` 包住的 JSON，能正确解析。
6. 第一次输出不合 schema、第二次合：返回 `ok: true`，`fetch` 被调了两次，token 数是两次之和。
7. 两次都不合：返回 `invalid_output`，`fetch` 恰好被调两次。
8. 请求超时：返回 `timeout`，`fetch` 只被调一次。
9. 5xx 重试一次后成功；4xx 不重试。
10. `fetch` 抛异常时 `call` 不抛异常。
11. 三种 `usage` 格式（DeepSeek 的、OpenAI 的、没有缓存字段的）下 `cachedInputTokens` 都取对。
12. `onTurn` 每次 `call` 恰好被调一次；它抛异常时 `call` 的返回不受影响。
13. 密钥只出现在请求头 `Authorization` 里。测试断言：`onTurn` 收到的记录和任何错误信息里都不包含密钥字符串。
14. 环境变量里没有密钥时，返回 `provider_error`，不发请求。
15. `bash scripts/verify.sh D2` 通过。

## 不要做

- 不写任何 Agent 的提示词。
- 不安装厂商的 SDK，直接用 `fetch`。
- 不做流式输出。
- 不把 `Turn` 存数据库。存库是调用方的事，你只调 `onTurn`。
- 不做语音。`SpeechToText` 接口本任务不实现。
- 不改 `src/contracts/`。
