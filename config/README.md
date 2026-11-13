# 模型配置

## 运行时：`models.json`

八个运行时 Agent 各占一项，结构是 `src/contracts/llm.ts` 里的 `ModelRoute`。当前全部指向 DeepSeek 的 `deepseek-flash`。

- 换模型：改对应 Agent 的 `model`。只改这一项即可，不需要改代码。
- 换地址或超时：改 `baseUrl`、`timeoutMs`。
- `apiKeyEnv` 是环境变量的名字，不是密钥本身。运行时只从这里取密钥，默认是 `DEEPSEEK_API_KEY`。
- **`provider` 必须保持 `"deepseek"`。** `loadRuntimeConfig` 会逐个检查八个运行时 Agent；任何一个被改成其他厂商都会直接拒绝启动。这是保护孩子数据的红线，没有跳过开关。

## 离线内容生产：`models.offline.json`

只给 `scripts/content/` 的离线流水线用，不接触孩子数据，因此允许使用 OpenAI。文件里有两项：

- `draft`：起草，默认 provider 为 `openai`。
- `review`：复核，默认 provider 为 `deepseek`。

两项的 `model` 都是占位值。负责人需要按自己账号实际可用的型号填写（例如把 `REPLACE_WITH_OPENAI_MODEL` 和 `REPLACE_WITH_DEEPSEEK_MODEL` 换成真实模型名）。如果不填，请求会被厂商拒绝，但不会影响运行时。

离线客户端不执行运行时那套 provider 红线检查，也绝不能被 `app/` 或 `src/agents/` 引用。详见 `src/llm/README.md`。
