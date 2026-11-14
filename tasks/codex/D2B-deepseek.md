# D2B DeepSeek现行对话协议与预算适配

正式任务，2026-11-14。按负责人新提供文档与官方核实接入，不配置密钥/不调真实服务。仅Sol medium单实现，root独立验收；不自行派agent、不合并推送。契约2.7与scopes冻结后开工。

## 背景和来源

现有src/llm已经使用DeepSeek POST /chat/completions、Bearer、JSON输出和图像块，不能重复建SDK客户端。当前请求未限制生成量，也未明确关闭默认思考；readCompletion忽略结束原因/拒答，需要兼容官方现行协议。

官方来源：[Chat Completions](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/)、[内容安全](https://api-docs.deepseek.com/zh-cn/guides/safety/)、[图像](https://api-docs.deepseek.com/zh-cn/guides/vision/)。这些是功能协议，不代表已完成真实服务质量验证。

## 实施边界

1. 保留唯一LlmClient、缓存消息顺序、JSON校验/纠正重试、8秒单次/既有总预算、注入fetch/clock/onTurn。runtime provider仅DeepSeek红线不变，离线OpenAI能力不受DeepSeek专用字段污染。允许调用已合并真实模块作集成，不改Agent/护栏内部。
2. 契约ModelRoute新增可选deepseek选项thinking/maxTokens；用共享DeepSeekOptionsSchema校验，未知字段拒绝。未配也采用thinking disabled、有限生成预算，不能落到供应商默认长思考。config/models.json为8个Agent明确配置，建议vision_homework=2048、vision_dictation=4096、char_coach/reader=512、essay/report=1024、guard/score=256；仍全部deepseek-flash。maxTokens契约限制1–8192，不能无限生成。
3. DeepSeek请求固定非流式JSON，并开启供应商高等级内容检查；平台检查不能取代现有withGuard/字卡来源/作文模板。重试和第一次请求使用同一预算/审核设置，buildRequestBody与实际runCall不能各维护一套失配逻辑。OpenAI离线路由保持原合法参数，不能附thinking/safety_check。
4. stop且无refusal才可取候选。length/content_filter/tool_calls/insufficient_system_resource/aborted及未知/缺失结束原因均不能当成功，即使content恰好是合法JSON；非空refusal或异常类型亦拒绝（null/缺失/空白不视为拒答，兼容离线OpenAI），不把拒答原文给孩子，不把reasoning_content当输出或写日志。blocked/aborted/tool_calls不自动重发可能收费/联网的请求；不启用联网工具，不为工具调用追执行。错误映射保持现有LlmResult兼容，provider_error或invalid_output按现有语义，计量不丢。
5. 正常stop空白JSON按无有效候选处理，最多既定纠正重试。供应商安全拒答/异常与schema错误区分可在内部元数据/文档说明，不扩大孩子API错误字段。HTTP400/401/403等不重试，现有500/网络重试规则保留，429不无限重试。
6. 使用官方usage/cache两个表示保持现有优先级和多次尝试求和；拒答/截断等失败也尽可能计量，供应商未给token时0代表未知，不能宣称等于零费用。既有同客户端并发/取消D2 onTurn归属必须正确，密钥/原文不进记录。
7. 不把DeepSeek网页demo“key存浏览器”照搬，仍仅服务端环境变量。不给模型自由工具权限，不实现StreamingUI；所有模型内容完成校验/护栏后才给孩子。供应商baseUrl仍配置现有固定值，本任务不新设用户URL入口。

## Scope

src/llm/、config/models.json、tests/integration/model.test.ts（仅补真实协议fixture及兼容回归）、tests/integration/deepseek/；package/lock和reports/D2B.md按总规则。contracts/root scripts/reviews/状态只读。C11A正在独立分支，实现期间不修改它；它的fake-fetch fixture若需补finish_reason，交root协调精确授权后更新，不能自行越界。

## 验收

1. 默认/显式预算、真实发送的首次/纠正请求一致；DeepSeek开启审核但无tools，OpenAI离线路由不带专有字段，非法选项拒绝。
2. 完整stop有效/空白/截断但合法JSON、拒答但合法JSON、tool_calls、资源中断、未知/缺原因各有正反例；迟到和失败不误当模型成功，收费重试有界。
3. 官方两种缓存计量、失败和多次尝试合计、同client并发/取消保持；无key零网络，密钥仅假值且不回显。
4. 原Agent/护栏/内容/eval/运行时全部回归，不能放宽schema或删难例；旧fake HTTP缺finish_reason须修成真实协议fixture，不靠decoder默许缺字段。
5. 集中focused后最终verify D2B（包含真实build），与C11A协调全套构建独占；报告逐条及尚待真实key联调。必要实际浏览器回归由root统一串行，无新UI不另造截图。

root新clone重装、亲跑探针/检查，问题写reviews/D2B.md原作者改；通过后按既有授权合并/推送。本包完成接入代码，不把缺密钥的本地假HTTP验证写成真实DeepSeek联调通过。
