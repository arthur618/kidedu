# 任务报告：D2B DeepSeek现行对话协议与预算适配

- 实现者：Codex，Sol medium（单实现，无子agent）
- 分支：task/D2B
- 自查结果：focused 101/101通过；root释放独占窗口后执行一次`bash scripts/verify.sh D2B`，退出码0。完整输出留于执行机`/private/tmp/d2b-final-verify.log`。

```text
Test Files  44 passed (44)
     Tests  831 passed (831)
src/server/build.test.ts: npm run build / Next.js 生产构建成功
== 3/4 范围检查 ==
范围检查通过：10 个文件都在 D2B 的范围内。
== 4/4 报告文件 ==
reports/D2B.md 存在
全部通过。
```

类型检查及`git diff --check`亦通过。真实生产构建由verify内build.test.ts执行（18.8秒），没有另跑重复build；整套耗时31.7秒。

## 做了什么

复用现有LlmClient，通过共享DeepSeekOptionsSchema严格校验可选thinking/maxTokens，拒绝OpenAI路由的DeepSeek选项。八个Agent均明确非思考与输出预算；未配置选项的DeepSeek请求默认非思考和1024输出token，固定非流式JSON与high安全检查，不声明工具。首次及纠正请求共用buildRequestBody，保留system/stablePrefix/user缓存顺序与既有两次尝试/截止时间。

只接收完整stop且无拒答/工具调用的候选；其他结束状态返回provider_error且不重试。refusal缺失/null/空白表示无拒答；非空或异常类型拒绝。仅完整stop的无效JSON/schema错误（含空白）进入既有一次纠正，reasoning_content从不作为候选、纠正消息或记录。

失败响应包括HTTP非2xx尽可能保留usage，仍按DeepSeek缓存字段优先、OpenAI别名兜底及多次尝试求和。原生AbortError与既有operation_timeout在fetch和读取响应体阶段均不重试；调用计量仍仅在结束时回调一次。新增真实LlmClient配合既有服务端预算/计量适配器的并发与取消测试。

协议依据为任务及[Chat Completions](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/)、[思考模式](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/)、[模型内容安全](https://api-docs.deepseek.com/zh-cn/guides/safety/)；没有真实供应商调用。

## 验收标准对照

| 验收标准 | 测试 | 状态 |
| --- | --- | --- |
| 1. 默认/显式预算、真实发送的首次/纠正请求一致；DeepSeek开启审核但无tools，OpenAI离线路由不带专有字段，非法选项拒绝。 | src/llm/deepseek.test.ts：“缺省和显式选项…首次/纠正请求共用预算与审核”（含1/8192边界）、“八个Agent明确非思考和有限预算”、“非法DeepSeek选项…启动拒绝”、“OpenAI配置拒绝DeepSeek选项，实际离线请求无专有字段”；client.test.ts缓存/图片顺序既有测试。 | focused通过 |
| 2. 完整stop有效/空白/截断但合法JSON、拒答但合法JSON、tool_calls、资源中断、未知/缺原因各有正反例；迟到和失败不误当模型成功，收费重试有界。 | deepseek.test.ts“完成原因与拒答”覆盖stop、length、content_filter、tool_calls、insufficient_system_resource、aborted、未知/null/缺字段、refusal缺失/null/空白/非空/异常类型；“stop带…仍拒绝且不执行工具”、“超时后迟到的合法stop不成功、不补记onTurn”、“HTTP…保留usage，重试次数有界”；client.test.ts网络/5xx/总预算测试。 | focused通过 |
| 3. 官方两种缓存计量、失败和多次尝试合计、同client并发/取消保持；无key零网络，密钥仅假值且不回显。 | client.test.ts两种缓存别名/优先级、成功/失败onTurn与密钥不泄露；deepseek.test.ts“先schema错误后拒答仍累计两次官方缓存计量”、HTTP400/401/403/429/500计量、缺usage/AbortError/无密钥；tests/integration/deepseek/concurrency.test.ts反序完成拒答与成功归属、单操作取消隔离；tests/integration/model.test.ts真实D2写Turn及整体预算取消。 | focused通过 |
| 4. 原Agent/护栏/内容/eval/运行时全部回归，不能放宽schema或删难例；旧fake HTTP缺finish_reason须修成真实协议fixture，不靠decoder默许缺字段。 | 仅为client.test.ts、offline.test.ts及tests/integration/model.test.ts正常fixture补finish_reason stop，取消fixture使用原生AbortError；无删测试/改契约。最终verify含原Agent/护栏/内容/eval/运行时共831测试及真实生产构建通过。 | 通过 |
| 5. 集中focused后最终verify D2B（包含真实build），与C11A协调全套构建独占；报告逐条及尚待真实key联调。必要实际浏览器回归由root统一串行，无新UI不另造截图。 | focused与集中自审已完成，发现响应体读取AbortError被JSON解析catch误归重试后已修正并补测试。未启动重复build/浏览器；最终verify在root授权独占窗口执行，831测试/真实build/scope/报告四项通过，结束后立即通知root释放窗口。 | 通过 |

## 改动的文件

- config/models.json
- src/llm/config.ts
- src/llm/internal.ts
- src/llm/README.md
- src/llm/client.test.ts
- src/llm/offline.test.ts
- src/llm/deepseek.test.ts（新增）
- tests/integration/model.test.ts
- tests/integration/deepseek/concurrency.test.ts（新增）
- reports/D2B.md（本报告）

## 新增依赖

无。npm ci使用现有lock与离线缓存；Prisma生成客户端。package/lock均无改动。

## 契约问题

无。src/contracts八个文件仅阅读，复用2.7新增的DeepSeekOptionsSchema与ModelRoute.deepseek。

## 没做的和已知问题

- 未配置密钥、未读private、未调用真实DeepSeek API；当前验证全为编造数据/假fetch，尚待负责人安全配置真实key后联调质量、延迟、额度与实际计费。
- 未给usage时记录的token 0表示未知，不表示零费用；供应商拒答/HTTP400也可能计费。已结束的超时调用无法补记迟到响应的usage，既有LlmTurnRecord没有“计量未知”字段；保留契约不扩展。
- 安全拒答、异常完成、工具/资源中断统一映射兼容的provider_error；无有效JSON/schema则invalid_output；单请求超时仍timeout。供应商检查不能替代本项目护栏与内容来源限制。
- 无新UI，未额外制造截图或启用浏览器回归。C11A代码、reviews、状态看板及主scripts均未修改。未合并或推送。

## 建议

负责人后续用合成材料完成真实key联调；若需要精确成本报表，可由契约负责人另包设计“usage缺失/部分/完整”计量状态，避免把未知token 0解释为免费。
