# 任务报告：D2C 安全审核与JSON传输协议兼容修复

- 实现者：Codex / Sol medium，单实现，无子agent
- 分支：task/D2C；基线main@2879305
- 日期：2026-11-16（客户端日期）
- 自查结果：focused src/llm 5文件104测试通过；完整verify待负责人预约授权窗口。

## 做了什么

仅在真实buildRequestBody按provider选择response_format：DeepSeek为text并保留high安全审核，OpenAI离线仍json_object。修复依据为root真实请求的400组合限制，不是密钥错误或thinking模式冲突。非思考/有限生成/非流式和无工具权限保持，原JSON输出后缀、JSON.parse、stripCodeFence、Zod、一次纠正与结束原因/拒答/usage/取消处理均未修改。

## 验收标准对照

| 验收标准 | 对应测试/证据 | 状态 |
| --- | --- | --- |
| 真实buildRequestBody按provider选择text/high或json_object；首次与纠正一致，仍非流式/非思考/原maxTokens/无tools；真实客户端出站body与假服务器拒旧组合/接新组合。 | deepseek.test.ts「D2C text与high协议端点回归」7例，内存假端点按body拒旧组合400，真实createLlmClient新组合成功；原「缺省和显式选项」首次与纠正断言保留，等价改text；offline.test.ts检查两provider实际出站格式与审核字段。 | focused通过 |
| text下合法JSON成功；坏JSON/空白/坏schema仍最多两次，拒答/截断不得成功；原usage/取消/并发/失败0未知语义保持。 | 新增3种非法候选分别纠正成功/持续失败共6例；原模型调用层97例保留，focused总104例，完成原因/拒答/HTTP/取消/统计等通过。旧测试仅两处DeepSeek格式断言等价修订及offline格式断言补充，无删除/skip/超时调整。 | focused通过 |
| focused→预约独占完整verify D2C含实际build，scope/contracts0/report准确，干净提交；root独立验收及真实小样本回测。 | focused通过，完整verify待授权；生产仅internal.ts，契约零修改。root独验与真实回测尚待负责人完成。 | 待完整自查与root独验 |

## 改动的文件

src/llm/internal.ts、src/llm/deepseek.test.ts、src/llm/client.test.ts、src/llm/offline.test.ts、src/llm/README.md、reports/D2C.md。

## 新增依赖

无；依赖与锁文件零修改。

## 契约问题

无；契约、模型配置、预算、提示词、护栏和阈值零修改。thinking仍disabled，maxTokens仍原值。

## 没做的和已知问题

作者未读取密钥/钥匙串/.env/private/真实孩子数据，未发真实请求，未跑浏览器。测试是本地假端点证据，不能替代供应商实际兼容/质量结果；root预算内真实小样本回测尚待完成。公开API文档允许text/json不代表保证json_object与high可组合，组合裁决来自root实际400诊断。text传输不保证JSON有效，仍须通过原本地解析、契约校验和有限纠正。

## 建议

由root在剩余保守预算内完成合成小样本真实回测，按实际结果决定后续评测，不把协议修复当作质量验收。
