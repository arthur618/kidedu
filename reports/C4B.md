# 任务报告：C4B DeepSeek离线公开资料检索

- 实现者：Codex / Sol medium
- 分支：task/C4B
- 自查结果：focused 108测试通过（61新增及47既有C4回归），typecheck通过；完整verify与真实构建待预约独占窗口。

## 做了什么

独立公开检索客户端和CLI，固定DeepSeek搜索协议，只投影有限参考摘要。默认关闭、空配置，不读取.env/private；产物不能直接批准或给孩子使用。所有HTTP验证使用编造数据，不含实际供应商请求。

## 验收标准对照

| 验收标准 | 测试 | 状态 |
| --- | --- | --- |
| 固定请求、开关、非法输入、Unicode/count边界 | client.test.ts | focused通过 |
| 官方映射、失败边界、时限、取消、单请求/用量 | client.test.ts | focused通过 |
| key/原错误canary、外部指令不执行、无正文/图标、数据不变 | client.test.ts及集成测试 | focused通过 |
| CLI/help、文件安全、审批隔离回归 | cli.test.ts及集成测试 | focused通过 |
| focused/verify/build/scope/契约差异 | 待独占窗口 | 等待独占窗口 |

## 改动的文件

scripts/content/research/（client.ts、cli.ts、测试、README），content/research/README.md，tests/integration/research/，package.json，.env.example，reports/C4B.md。

## 新增依赖

无。

## 契约问题

无。

## 没做的和已知问题

真实DeepSeek联调、真实密钥和额度验证未做，留C4B-live。不可捕获系统终止可能留隐藏临时文件，不会留半份最终JSON；README有说明。

## 建议

由负责人在C4B-live核对实际额度、收费与接口响应，勿把key贴聊天。
