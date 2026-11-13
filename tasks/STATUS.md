# 任务看板

由总设计师维护。状态：未开始 / 进行中 / 待验收 / 需修改 / 已合并。

| 任务 | 内容 | 交给 | 批次 | 前提 | 状态 | 验收记录 |
| --- | --- | --- | --- | --- | --- | --- |
| T0 | 契约：`src/contracts/` | 总设计师 | 0 | 无 | 已合并 | 类型检查通过 |
| C1 | 编排器状态机与间隔复习 | Codex | 1 | T0 | 需修改 | `reviews/C1.md`；按 `tasks/codex/C1-rework.md` 返工 |
| D1 | 数据库与后端骨架 | DeepSeek harness | 1 | T0 | 进行中 | 另见 `tasks/deepseek/D1-addendum.md` |
| D2 | 模型调用层 | DeepSeek harness | 1 | T0 | 进行中 | |
| C3 | 各 Agent 的提示词与函数 | Codex | 2 | D2 | 未开始 | |
| D3 | 护栏 | DeepSeek harness | 2 | D2 | 未开始 | |
| C2 | 孩子端界面（认字回路） | Codex | 2 | C1、D1 | 未开始 | |
| D4 | 评测脚本 | DeepSeek harness | 3 | C3、D3 | 未开始 | |
| C4 | 内容生产流水线 | Codex | 3 | D2 | 未开始 | |

## 之后的任务（任务文件待写，等前三批验收后根据实际情况细化）

| 任务 | 内容 | 里程碑 |
| --- | --- | --- |
| I1 | 集成：把编排器、Agent、护栏接进会话接口，记录 Turn 和 Incident | M1 |
| S1 | 语音：报词音频合成；语音转文字接入（供应商待定） | M1–M2 |
| R1 | 课外阅读：短文选择、阅读界面、点字查卡、讲给小问号听 | M2 |
| E1 | 作文启发：采访界面、素材卡、读后反馈 | M3 |
| N1 | 夜间批处理：评分、日报；家长端；复核后台 | M4 |

## 契约变更记录

| 日期 | 变更 | 影响的任务 |
| --- | --- | --- |
| 2026-11-13 | 初版 | 全部 |
| 2026-11-13 | 版本 2，只动 `orchestrator.ts`：`SessionContext` 增加 `hasEssayToday`、`understandQueue`、`writeQueue`、`understandAttempts`；`DailyPlan` 增加 `carryOverChars`；增加 `wrap_up_done` 事件、`SessionEventSchema`、`NextStage`、`InitContext`；`Effect` 的 payload 改为精确类型；认读答错改为进入 understand；理解答错最多两次；`stageOf` 由 reduce 维护 | C1（返工）、D1（补充说明）。D2 不受影响 |
