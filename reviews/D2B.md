# 验收记录：D2B DeepSeek现行对话协议与预算

- 验收人：总设计师（独立验收对话）
- 分支与提交：task/D2B @ 2602d6942cb24a5861cc76042d318461f4c97014
- 结论：通过（代码阶段；真实供应商联调延后）

## 独立机器检查

新建不共享node_modules的clone，固定交付SHA，离线npm ci；试合main@bee8180，生成C11A新增Prisma模型后亲自执行检查。没有把作者831项结果当作本次证据。

| 项目 | 结果 |
| --- | --- |
| 类型检查 | 通过 |
| 测试及实际生产构建 | 49文件867测试通过；verify中的build.test真实执行Next构建 |
| 范围 | 10文件，D2B允许范围 |
| 契约 | 分支差异0 |
| 报告 | reports/D2B.md存在，真实联调未完成如实标明 |
| 浏览器 | 独立27项全部通过，含认字/阅读/作文及语音文字退路 |
| 补充探针 | 真实createLlmClient注入合成HTTP：纠正后安全拒答、两次usage求和、4种异常结束仅1请求、无key零网络、记录不含key/reasoning |

## 标准核对与生产代码审读

1. config/models.json八Agent显式非思考及有限输出；config.ts复用共享DeepSeekOptionsSchema，严格拒绝错误字段和OpenAI的专有选项。internal.ts首次与纠正均走同一buildRequestBody，DeepSeek固定非流式JSON/high审核，不声明tools；离线OpenAI请求不附专有字段。通过。
2. readCompletion先检查stop、refusal与工具字段再读取候选；截断但JSON完整、被过滤但JSON合法、未知/缺失原因均失败且不进行收费纠正。空白stop仍受原两次校验上限，reasoning不作候选。fetch和body阶段AbortError均不重试。通过。
3. readUsage在成功/失败及非2xx中尽可能提取，两次尝试求和，仅终结onTurn一次；官方缓存别名优先级与原客户端并发归属保留。既有操作取消集成测试验证同client另一操作继续。通过。
4. 旧fixture只补真实协议finish_reason，没有放宽Agent/护栏schema或删除难例；C11A主线结合后867测试和构建通过。通过。
5. 无新UI/依赖/配置密钥，独立浏览器回归既有27项通过。报告区分代码完成与真实质量/计费未测。通过。

## 必须修改

无。

## 后续边界

- high供应商检查不替代项目护栏/approved内容/作文受信问题。
- 供应商不返回usage或超时后才给usage时，记录0是未知，不代表免费；迟到用量不会补写。当前契约未表达完整度，不据此承诺精确费用。
- 未访问真实DeepSeek、未配置key；默认长度/审核延迟、实际质量与计费仍须后续合成材料联调。当前结论不包含真实服务可用性。
