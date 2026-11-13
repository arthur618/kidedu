# D1 补充说明：契约更新到版本 2

- 交给：D1 的实现者
- 分支：继续用 `task/D1`

契约文件 `src/contracts/orchestrator.ts` 更新了。把 `main` 合并进 `task/D1` 后，按下面四点调整。如果你的 D1 已经做完并提交，在同一分支上追加修改即可。

1. **校验事件用契约里的 `SessionEventSchema`。** 接口收到事件后用它做 `safeParse`，不要自己另写一份事件的 zod 结构。已经写了的，删掉换成它。

2. **新建会话时用 `InitContext`。** `src/server/deps.ts` 里增加一个占位的 `initContext`（和 `reduce` 等一样，C1 合并后改成从 `@/orchestrator` 导入）。`POST /api/session` 的流程是：
   - 读出孩子的全部 `ChildChar` 和这一课的字；
   - 调 `planDay` 得到计划；
   - 为计划里的每个字准备 `stageOf` 和 `kindOf`（数据库里没有的新字，阶段是 `recognize`，类别按这一课的 `recognizeChars` / `writeChars`）；
   - 调 `initContext` 得到上下文；
   - 发送 `start` 事件。

3. **上下文原样存、原样取。** `handleEvent` 把 `reduce` 返回的 `ctx` 整个存成 JSON，下次整个读出来传回去。不要修改它，不要只挑一部分字段存，也不要在两次事件之间更新 `stageOf`（现在由 `reduce` 自己维护）。

4. **`persist_char` 遇到数据库里没有的字时新建。** 新字第一次出现时 `ChildChar` 还不存在：用 `stage: "recognize"`、`correctStreak: 0`、`wrongCount: 0`、`nextReviewOn: null`、`lastSeenOn: null` 和上下文里的 `kindOf` 造一条，再调 `advanceChar`，然后保存。

## 新增验收标准

12. 事件校验用的是从 `@/contracts/orchestrator` 导入的 `SessionEventSchema`（测试：发送 `{ "type": "wrap_up_done" }` 被接受，发送 `{ "type": "不存在" }` 返回 400）。
13. 假 `reduce` 返回一个带有额外字段的 `ctx` 时，下一次事件传给 `reduce` 的 `ctx` 和上次返回的深度相等。
14. 对数据库里不存在的字执行 `persist_char`，执行后 `ChildChar` 表里有这条记录，内容等于 `advanceChar` 的返回值。
15. `POST /api/session` 用假的 `planDay` 和 `initContext` 测试：传给 `initContext` 的 `stageOf` 和 `kindOf` 覆盖计划里的每一个字。

在 `reports/D1.md` 里加一节“契约版本 2 的调整”，逐条说明。
