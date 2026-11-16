# D2C 真实接口暴露的安全审核/JSON模式兼容修复

2026-11-16，总设计师裁决。只修已复现HTTP400，不扩功能、不改提示词/护栏/阈值，不读密钥，不派agent，不合并推送。Sol medium单实现，root独立验收/真实回测。

## 实际证据与裁决

root用钥匙串凭据、5个公开合成case调用现有LlmClient，全部400；另1个脱敏诊断返回：response_format只允许text与safety_check等扩展共同使用。不是质量失败或鉴权失败。原D2B要求非流式json_object+high安全审核是设计组合错误，正式更正，不把符合旧任务的实现者追责。

**保留safety_check high，DeepSeek请求改response_format:{type:"text"}。** 模型仍须按原后缀输出JSON，保留现有JSON.parse/stripCodeFence/Zod校验/一次纠正；上游不再保证JSON有效，本地校验不能放松。OpenAI离线仍json_object，不改变其参数。共享ModelRoute契约不变。不能通过去掉high/忽略400/返回fallback或只在eval改请求来假装产品已修。

## 精确scope

src/llm/internal.ts、src/llm/deepseek.test.ts、src/llm/client.test.ts、src/llm/offline.test.ts、src/llm/README.md、reports/D2C.md。不改contracts、config模型/预算、提示词、guard、其他旧测试、依赖或脚本。确有其他断言需等价修订先报root路径。

## 验收

1. 真实buildRequestBody按provider选择text/high或json_object；首次与纠正一致，仍非流式/非思考/原maxTokens/无tools。测试真实客户端出站body，错误组合的假服务器400与正确组合成功都覆盖，不仅断言常量。
2. text响应下合法JSON成功、坏JSON/空白/坏schema仍有限纠正，最多2次，不把无效内容/拒答/截断当成功；现有finish_reason/refusal/usage/取消/并发/失败0未知语义与全部旧断言保持。仅等价改DeepSeek格式断言，不能删难例/skip/增超时。
3. focused→预约独占完整verify D2C（含实际build），scope/contracts0/report准确，干净提交；不跑浏览器（无UI）。root新clone安装、读生产差异、完整verify与预算内真实小样本回测，实际400须消除，不以测试替代供应商证据。

官方参考：https://api-docs.deepseek.com/zh-cn/guides/safety/ 与 https://api-docs.deepseek.com/zh-cn/guides/json_mode/ 。实际供应商错误是兼容裁决依据，不声称文档此前明确保证两者兼容。
