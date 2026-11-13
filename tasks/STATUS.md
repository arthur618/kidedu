# 任务看板

由总设计师维护。状态：未开始 / 进行中 / 待验收 / 需修改 / 待合并 / 已合并 / 阻塞。

| 任务 | 内容 | 交给 | 批次 | 前提 | 状态 | 验收记录 |
| --- | --- | --- | --- | --- | --- | --- |
| T0 | 契约：`src/contracts/` | 总设计师 | 0 | 无 | 已合并 | 当前版本 2.1 |
| C1 | 编排器状态机与间隔复习 | Codex | 1 | T0 | 已合并 | `reviews/C1.md` |
| D2 | 模型调用层 | DeepSeek harness | 1 | T0 | 已合并 | `reviews/D2.md` |
| D1 | 数据库与后端骨架 | DeepSeek harness | 1 | T0 | 已合并 | `reviews/D1.md`：226341a 第二次验收通过；合并提交24ca021，main 439个测试与生产构建通过 |
| C3 | 各 Agent 的提示词与函数 | Codex | 2 | D2 | 已合并 | `reviews/C3.md`：37f04cf 通过；合并fe42e9f，main 519个测试与构建通过 |
| C5 | 护栏（原 D3） | Codex | 2 | D2 | 已合并 | `reviews/C5.md`：b9052c6 第二次验收通过；合并提交 d83a064，main 405个测试通过 |
| C2 | 孩子端界面（认字回路） | Codex | 2 | C1、D1 | 待验收 | Terra high交付9ec4086；报告与32张截图待独立复验 |
| C6 | 评测脚本（原 D4） | Codex | 3 | C3、C5 | 进行中 | Sol high恢复，agent resume_c6_sol；本轮仅脚本验收，真实评测稍后 |
| C4 | 内容生产流水线 | Codex | 3 | D2 | 待验收 | Sol medium交付725b22c；中文路径范围检查兼容问题待总设计师复核 |
| C7 | 集成：接口、编排器、Agent、护栏接通（原 I1） | Codex | 4 | C1、D1、D2、C3、C5 | 未开始 | |

## 之后的任务（全部交给 Codex；任务文件在 C7 验收后根据集成的实际情况再写）

| 任务 | 内容 | 里程碑 |
| --- | --- | --- |
| C8 | 语音：报词音频合成；语音转文字接入（供应商待定） | M1–M2 |
| C9 | 课外阅读：短文选择、阅读界面、点字查卡、讲给小问号听 | M2 |
| C10 | 作文启发：采访界面、素材卡、读后反馈 | M3 |
| C11 | 夜间批处理：评分、日报；家长端；复核后台 | M4 |

## 契约变更记录

| 日期 | 变更 | 影响的任务 |
| --- | --- | --- |
| 2026-11-13 | 初版 | 全部 |
| 2026-11-13 | 版本 2，只动 `orchestrator.ts`：`SessionContext` 增加 `hasEssayToday`、`understandQueue`、`writeQueue`、`understandAttempts`；`DailyPlan` 增加 `carryOverChars`；增加 `wrap_up_done` 事件、`SessionEventSchema`、`NextStage`、`InitContext`；`Effect` 的 payload 改为精确类型；认读答错改为进入 understand；理解答错最多两次；`stageOf` 由 reduce 维护 | C1（返工）、D1（补充说明）。D2 不受影响 |
| 2026-11-13 | 版本 2.1，只动 `llm.ts`：增加 `LlmTurnRecord` 类型（只加不改） | D2（返工时改为从契约导入） |

## 2026-11-13 验收裁决与已知欠账

- C3：维持契约2.1，不增加形近字区别字段。区别只能来自已审核的explain，没有说明时只提醒对照字形。
- 单字符schema的UTF-16限制暂缓，补充平面汉字需要整体定义长度与索引后再支持。
- 运行时内容只允许status=approved；由D1查询和C7组装输入守住。C6使用合成图片替换C3视觉fixture占位URL。
- C5：b9052c6已删除递归自查测试，第二次验收通过；负责人授权Codex执行合并（d83a064），main自查405个测试通过。
- D1：226341a第二次验收通过并合并（24ca021）；原分支404个测试、合并后main 439个测试及构建通过，事务回滚独立探针通过。C7需把模型及护栏外部调用放在数据库事务提交之后。
- 依赖审计仍有11项（含运行时Zod、旧测试工具链及新增Prisma CLI配置链）；Next告警已消除，后续另行安排依赖专项。


## 当前并行派发（2026-11-13）

- C2：独立worktree yuwen-c2-ui，按/learn入口实现，避免与D1的根首页冲突；接口数据缺口在报告列明，由总设计师统一交C7接线。
- C4：独立worktree yuwen-c4-content，离线流水线和示例使用假客户端，不调用真实模型。
- C6：C3已合并，从统一main基准e888dc9派发独立worktree yuwen-c6-evals，现已开始实现。样例与private结果隔离规则见tasks/codex/C6-addendum.md。当前环境没有已配置的DEEPSEEK_API_KEY，不伪造真实评测证据。
- 实现agent不改契约、验证脚本、reviews和看板，不合并、不推送。总设计师在独立克隆复验并写review，按负责人授权执行通过后的本地合并。


## 执行阻塞记录（2026-11-13）

三个实现agent均返回“Your workspace is out of credits”，并停止执行。C2/C4/C6的独立worktree和未提交草稿均已保留，另存tracked patch及untracked文件恢复包；没有代实现者提交或合并这些草稿。主仓代码仍为C3合并后的519测试通过基线。

负责人已选择本轮先完成C6脚本验收，真实模型评测稍后再做；缺凭据不应阻止额度恢复后的脚本开发。恢复步骤、agent标识和草稿状态见tasks/RESUME.md。额度需工作区所有者恢复，恢复前不重复启动agent或把草稿标成交付。


## 模型分配调整与恢复（2026-11-13）

负责人要求按复杂度选择性价比模型。重新查询显示普通用量允许执行，使用显式指定的新agent恢复原worktree：C2=Terra high、C4=Sol medium、C6=Sol high，当前均继续草稿。此前“额度阻塞”记录保留为历史，不代表当前仍停止。分配依据、成本口径与升档纪律见tasks/MODEL-ROUTING.md；当前agent标识与恢复说明已同步。

模型调整后的首批交付：C2 @ 9ec4086、C4 @ 725b22c均已提交且实现worktree干净，仍未独立验收或合并；C6继续执行。实现者报告的自查输出不是总验收结论。C4标准范围检查存在中文路径转义误报，临时core.quotePath=false的自查命令已在报告披露，由总设计师核对验证工具。
