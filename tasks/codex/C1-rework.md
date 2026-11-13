# C1 返工：按契约版本 2 调整

- 交给：Codex（原 C1 的实现者）
- 分支：继续用 `task/C1`
- 允许修改的路径：`src/orchestrator/`

## 背景

你在 C1 报告里指出的契约问题都成立。契约已更新到版本 2，`main` 上的 `src/contracts/orchestrator.ts` 是新的事实来源。验收意见在 `reviews/C1.md`。

## 先做

1. 把 `main` 合并进 `task/C1`（或变基），拿到新契约。
2. 重读 `src/contracts/orchestrator.ts` 全文。规则编号变了：间隔复习是 1–8，状态机是 a–j。

## 要改的地方

| 序号 | 改什么 | 对应契约 |
| --- | --- | --- |
| 1 | 删除 `OrchestratorContext`。上下文直接用契约的 `SessionContext`，字段名是 `hasEssayToday`、`understandQueue`、`writeQueue`、`understandAttempts`。删除 `contextWithMemory` 这类兼容旧上下文的代码 | `SessionContext` |
| 2 | 导出 `initContext: InitContext`，替换原来的 `initialContext` | `InitContext` |
| 3 | 导出 `nextStage: NextStage`。`advanceChar` 内部用它算阶段，保证两者不会分叉 | `NextStage`、规则 1–8 |
| 4 | 认读答错改为进入 understand 阶段（原来是留在 recognize） | 规则 1 |
| 5 | 离开复习阶段时 `nextReviewOn` 置空；mastered 只更新 `lastSeenOn` | 规则 6、7、8 |
| 6 | `planDay` 返回 `carryOverChars`，最多 8 个 | `DailyPlan`、`PlanDay` |
| 7 | `reduce` 每发出一条 `persist_char`，同时用 `nextStage` 更新 `ctx.stageOf`。不再读取“外层刷新过的” `stageOf` | 规则 f、g、h、j |
| 8 | 遗留字：stage 为 understand 的直接进 `understandQueue`，stage 为 write 的直接进 `writeQueue`，都不经过认读 | 规则 e |
| 9 | 理解答错：同一个字最多两次，第二次仍错则移出队列，不进 `writeQueue` | 规则 g |
| 10 | 收尾：用 `wrap_up_done`，不再借用 `essay_step_done`。wrap_up 收到 `wrap_up_done`、`quit`、`time_up` 都进入 ended | 规则 b、c |
| 11 | `call_agent` 的 payload 按契约里的四种精确类型给，`vision_dictation` 的字段名是 `chars` | `Effect` |
| 12 | 删除 `verification.test.ts` 里测试 `scripts/verify.sh` 的 [15] 用例。保留 [16] 的静态检查 | `reviews/C1.md` 第 7 条 |

## 验收标准

原任务文件的 16 条仍然有效，其中第 1、7、8、11、14 条按新规则调整。另外新增：

17. `nextStage` 与 `advanceChar` 一致：对 6 个阶段 × 2 种类别 × 2 种结果的全部组合，`advanceChar(cc, r, today).stage === nextStage(cc.stage, cc.kind, r)`。
18. 认读答错的新字只做一次讲解：认读错、理解对之后，这个字离开理解队列，会写字进入听写。
19. 同一个字理解连续答错两次后被移出队列，会话继续往下走；它的 `stageOf` 仍是 understand，没有进入 `writeQueue`。
20. 遗留字不经过认读：计划里只有遗留字（一个 understand、一个 write）时，会话从 homework_confirm 直接进入 understand，之后听写队列里同时有这两个字中该写的那些。
21. 全程 JSON 往返：正常路径一和路径二各跑一遍，每一步都把 `ctx` 做 `JSON.parse(JSON.stringify(ctx))` 再传入，最终状态、每一步的效果和不做往返时完全相同。测试里的外层**不得**修改 `ctx`。
22. 外层只负责执行效果：路径测试里，外层对 `persist_char` 调 `advanceChar` 得到的 `stage`，在每一步都等于 `ctx.stageOf` 里的值。
23. wrap_up 状态下 `wrap_up_done`、`quit`、`time_up` 三个事件各自都进入 ended 并发出 `end_session`；`essay_step_done` 在 wrap_up 是非法事件。
24. `planDay`：stage 为 understand 或 write 的字出现在 `carryOverChars`；超过 8 个时按 `wrongCount` 降序、码点升序取前 8；同时是课内新字的不重复出现。
25. 生产代码里不再出现 `in ctx` 这类对上下文形状的运行时探测。
26. `bash scripts/verify.sh C1` 通过。

## 报告

在 `reports/C1.md` 末尾加一节“第二次交付”：上表 12 项逐条说明怎么改的，更新状态转移表，新契约里还有歧义的地方继续写进“契约问题”。
