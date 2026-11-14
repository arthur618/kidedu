# C11A 夜间事实汇总、复述评分与日报

- 状态：已派发，Sol high单agent，task/C11A。
- 前提：C7/C9/C10已验收合并，契约2.6与精确scope冻结。
- 必须完整读[C11A-addendum.md](C11A-addendum.md)，它是正式裁决，优先于原C11规划和旧preflight。
- 不做C11B家长鉴权/UI，不做真实外部配置/接口联调，不部署或安装实际定时任务。
- 报告reports/C11A.md；原始数据全部编造，真实模块+假模型。实现者不改contracts/reviews/看板/主scripts，不合并/推送，不派子agent。

## 验收索引

1. 固定一天来源逐项手工对账：实际练习/复习/错字、合并裁日会话时长、确认清单、完整复述来源、作文完成元信息，不把计划当实际。
2. LearningOutcome为实际before/after、append-only；observer与ChildChar/SessionRuntime/command原子；新会话完整覆盖、历史不补造，真实SQLite故障/重启/重放不重复。
3. 两时区、跨日/重叠/无活动/旧来源缺失/不同孩子；评分0与null严格分开，原题/要点快照和原话输入正确，公开理由固定，私有内容不外泄。
4. 相同源幂等、成功步复用、失败显式重试与report依赖输入失效、源版本更新、租约/CAS重启及晚发布防覆盖。
5. 只DeepSeek运行时客户端；score/report失败、无凭据、结构合法却不符事实的日报候选均有明确退路/计量/错误类别；无虚构表现或家长任务。
6. 显式child/date CLI、真实迁移库本地烟测、可注入调度；默认不扫整库、不部署、不隐式删原始数据。
7. 每次真实调用归属/token/缓存/latency正确，源hash不含自身新Turn/job/report防自循环；日志/Turn/公共DTO无原文/参考要点/媒体/密钥。
8. 一次最终verify含实际build，保留原27浏览器，范围/报告通过；明确单Node/SQLite、至少一次外部调用/费用和真实模型质量限制。
