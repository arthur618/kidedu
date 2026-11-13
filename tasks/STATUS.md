# 任务看板

由总设计师维护。状态：未开始 / 进行中 / 待验收 / 需修改 / 已合并。

| 任务 | 内容 | 交给 | 批次 | 前提 | 状态 | 验收记录 |
| --- | --- | --- | --- | --- | --- | --- |
| T0 | 契约：`src/contracts/` | 总设计师 | 0 | 无 | 已合并 | 当前版本 2.1 |
| C1 | 编排器状态机与间隔复习 | Codex | 1 | T0 | 已合并 | `reviews/C1.md` |
| D2 | 模型调用层 | DeepSeek harness | 1 | T0 | 已合并 | `reviews/D2.md` |
| D1 | 数据库与后端骨架 | DeepSeek harness | 1 | T0 | 进行中 | 另见 `tasks/deepseek/D1-addendum.md` |
| C3 | 各 Agent 的提示词与函数 | Codex | 2 | D2 | 未开始 | |
| C5 | 护栏（原 D3） | Codex | 2 | D2 | 未开始 | |
| C2 | 孩子端界面（认字回路） | Codex | 2 | C1、D1 | 未开始 | |
| C6 | 评测脚本（原 D4） | Codex | 3 | C3、C5 | 未开始 | |
| C4 | 内容生产流水线 | Codex | 3 | D2 | 未开始 | |
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
