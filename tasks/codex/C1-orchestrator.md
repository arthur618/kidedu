# C1 编排器状态机与间隔复习

- 交给：Codex
- 批次：第一批，可立即开始
- 分支：`task/C1`
- 允许修改的路径：`src/orchestrator/`

## 目标

实现 `src/contracts/orchestrator.ts` 里定义的三个函数：`AdvanceChar`、`PlanDay`、`Reduce`。它们决定一个字什么时候过关、每天学哪些字、一次学习的每一步接下来做什么。这是整个系统里逻辑最密的部分，全部是纯函数。

## 要读的契约

- `src/contracts/orchestrator.ts`：类型和规则。注释里的编号规则就是需求，逐条实现。
- `src/contracts/schemas.ts`：`ChildChar`、`CharStage`、`CharKind`、`HomeworkItem`。

## 交付物

| 文件 | 内容 |
| --- | --- |
| `src/orchestrator/schedule.ts` | 导出 `advanceChar: AdvanceChar` 和 `planDay: PlanDay` |
| `src/orchestrator/reduce.ts` | 导出 `reduce: Reduce` 和 `initialContext(...)` |
| `src/orchestrator/dates.ts` | 日期加减的小工具，只处理 `YYYY-MM-DD` 字符串 |
| `src/orchestrator/index.ts` | 统一导出 |
| `src/orchestrator/*.test.ts` | 测试 |

## 实现要求

- 纯函数。不调用 `Date.now()`、`new Date()`（无参）、`Math.random()`，不读环境变量，不做任何输入输出。今天的日期从参数来。
- 不修改传入的对象，返回新对象。
- 日期计算按日历日，不涉及时区：`2026-11-29` 加 2 天是 `2026-12-01`。
- `reduce` 遇到当前状态不接受的事件时，原样返回状态和上下文，`effects` 为空，不抛异常。
- `reduce` 不直接推进字的状态，只发出 `persist_char` 效果；外层收到后调用 `advanceChar` 并存库。
- 给 `call_agent` 效果的 `payload` 只放编排器已有的信息（字、步骤、作业图片地址等），不拼提示词。

## 验收标准

每一条都要有至少一个测试，测试名里带上编号。

间隔复习：

1. `AdvanceChar` 的规则 1–7 各有答对和答错两个方向的测试（规则 6 只需一个）。
2. “会认字”（`recognize_only`）在 `understand` 答对后进入 `review_2d`，不经过 `write`。
3. 跨月和跨年的日期计算正确：`2026-11-29` 加 2 天、`2026-12-28` 加 7 天。
4. `advanceChar` 不修改入参（对入参做深冻结后调用不报错）。
5. `planDay`：未到期的复习字不出现；到期和过期的出现；复习字超过 12 个时取 `wrongCount` 最高的 12 个，并列时按字的 Unicode 顺序，结果稳定。
6. `planDay`：课内的新字如果已经在 `all` 里且不是 `recognize` 状态，不算新字。

状态机：

7. 正常路径一：`start(hasEssayToday=false)` 走到 `ended`，依次经过 homework_capture、homework_confirm、recognize、understand、dictation_play、dictation_capture、dictation_compare、reading_offer、reading、retell、wrap_up。
8. 正常路径二：`hasEssayToday=true` 时，认字环节后进入 essay_interview、essay_cards、essay_feedback，再到 wrap_up，不经过 reading_offer。
9. 当天没有“会写字”时，跳过三个 dictation 状态。
10. `reading_choice.accept=false` 直接到 wrap_up。
11. 对每一个非终止状态，`time_up` 和 `quit` 都走到 wrap_up 并发出 `persist_session`，再到 ended 并发出 `end_session`。用循环覆盖所有状态。
12. 对每一个状态，发送一个它不接受的事件，状态不变、effects 为空、不抛异常。
13. recognize 阶段每收到一个 `recognize_result`，发出一条对应的 `persist_char`；队列清空后才进入下一状态。
14. recognize 答对的旧字（复习字）不进入 understand；答错的字和所有新字进入 understand。

整体：

15. `bash scripts/verify.sh C1` 通过。
16. `src/orchestrator/` 里没有 `any`（测试文件除外）。

## 不在范围内

- 不调模型，不写提示词，不碰数据库和界面。
- 不实现语音识别。`recognize_result.mode` 只是透传。
- 不改契约。规则有歧义时按最保守的理解实现，并在报告的“契约问题”里写明你的理解。

## 完成后

按 `AGENTS.md` 的“交付方式”提交，并在报告里附一张你实际实现的状态转移表（状态 × 事件 → 下一状态）。
