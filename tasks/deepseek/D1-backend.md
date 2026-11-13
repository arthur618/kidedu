# D1 数据库与后端骨架

- 交给：DeepSeek harness
- 批次：第一批，可立即开始
- 分支：`task/D1`
- 允许修改的路径：`prisma/`、`src/db/`、`src/server/`、`app/api/`、`app/layout.tsx`、`app/page.tsx`、`next.config.mjs`、`next-env.d.ts`

开工前先读：`AGENTS.md`、`docs/ARCHITECTURE.md`、`src/contracts/` 下的三个文件。

## 目标

搭好 Next.js 项目骨架，建数据库表，写数据访问层和会话接口。做完后，别的任务可以通过接口开始一次学习、发送事件、读取状态。

## 按顺序做

### 第 1 步：安装框架

- 安装 `next`、`react`、`react-dom`、`prisma`、`@prisma/client`，以及对应的类型包。
- 在 `package.json` 加脚本：`dev`、`build`、`db:migrate`、`db:seed`、`db:import`。不要改已有的 `typecheck`、`test`、`verify`。
- 新建 `app/layout.tsx`（`lang="zh-CN"`）和 `app/page.tsx`（只显示项目名）。
- 确认 `npm run typecheck` 和 `npm run build` 能过。

### 第 2 步：建表

在 `prisma/schema.prisma` 里建下面这些表。字段以 `src/contracts/schemas.ts` 里的同名类型为准，一个字段都不要多、不要少、不要改名。数组和嵌套对象用 JSON 字符串列存。

`Child`、`Lesson`、`CharCard`、`Passage`、`ChildChar`、`Session`、`Turn`、`Incident`

- `ChildChar` 的主键是 `(childId, char)`。
- `CharCard.char` 唯一。
- 数据库用 SQLite，地址从环境变量 `DATABASE_URL` 读。

### 第 3 步：数据访问层

在 `src/db/` 里每张表一个文件，导出读写函数。要求：

- 函数的入参和返回值用契约里的类型（`Child`、`ChildChar` 等），不要把 Prisma 的类型暴露出去。
- 从数据库读出来的每一行，用契约里对应的 zod schema 做一次 `parse` 再返回。
- 读内容表（`Lesson`、`CharCard`、`Passage`）的函数默认只返回 `status` 为 `approved` 的行。
- 需要的函数至少有：
  - `getChild(id)`、`createChild(data)`
  - `listChildChars(childId)`、`upsertChildChar(cc)`
  - `getLesson(id)`、`getCharCard(char)`、`getCharCards(chars)`
  - `createSession(childId, startedAt)`、`getSession(id)`、`updateSession(session)`
  - `insertTurn(turn)`、`insertIncident(incident)`

### 第 4 步：会话接口

编排器（任务 C1）还没合并。你按 `src/contracts/orchestrator.ts` 里的类型 `Reduce`、`AdvanceChar`、`PlanDay` 来写，把它们当作从外面传进来的参数。

在 `src/server/session.ts` 写一个函数：

```ts
handleEvent(deps, sessionId, event): Promise<{ state: SessionState; effects: Effect[] }>
```

`deps` 里有：`reduce`、`advanceChar`、数据访问函数、`now()`。它做的事：

1. 读出会话当前的状态和上下文（存在 `Session` 表之外的一个 JSON 列或单独的表里，你来定，写进报告）。
2. 调 `reduce(state, ctx, event)`。
3. 逐个处理返回的效果：
   - `persist_char`：读出这个字的 `ChildChar`，调 `advanceChar`，存回去。
   - `persist_session`：把作业清单和结束时间存回 `Session`。
   - `end_session`：标记会话结束。
   - `call_agent`、`play_audio`、`show`：不处理，原样返回给调用方。
4. 保存新的状态和上下文，返回。

然后写三个接口：

| 接口 | 作用 |
| --- | --- |
| `POST /api/session` | 入参 `{ childId, lessonId, hasEssayToday }`。调 `planDay` 得到当天计划，新建会话，发送 `start` 事件，返回 `{ sessionId, state, effects }` |
| `POST /api/session/[id]/event` | 入参是一个 `SessionEvent`。调 `handleEvent`，返回 `{ state, effects }` |
| `GET /api/session/[id]` | 返回当前状态、上下文、作业清单 |

接口里用到的 `reduce`、`advanceChar`、`planDay` 从 `src/server/deps.ts` 取。这个文件现在导出会抛出“C1 尚未合并”的占位函数，并在注释里写明 C1 合并后改成从 `@/orchestrator` 导入。

### 第 5 步：种子数据和导入脚本

- `npm run db:seed`：插入一个编造的孩子、一课编造的内容（6 个常见字，全部 `approved`）。数据放 `prisma/seed-data.json`。
- `npm run db:import -- <目录>`：读取目录下的 `cards/*.json`、`passages/*.json`、`lessons/*.json`，只导入 `status` 为 `approved` 的，已存在的按主键更新。

### 第 6 步：写说明

`src/server/README.md`：三个接口的地址、入参、返回值各给一个例子；怎么在本地启动；会话状态存在哪。

## 验收标准

每条至少一个测试。测试用内存里的或临时文件的 SQLite，不依赖开发库。

1. `npm run build` 成功。
2. 每张表：写入一条契约类型的数据再读出来，和写入的完全相等。
3. 往内容表里直接插一条 `draft` 的字卡，`getCharCard` 读不到它。
4. 数据库里有一行不符合契约的数据时，读取函数抛出明确的错误，不返回坏数据。
5. `handleEvent` 用假的 `reduce` 测试：假 `reduce` 返回一个 `persist_char` 效果时，`advanceChar` 被调用一次，结果被存进 `ChildChar`。
6. `handleEvent` 把 `call_agent`、`show`、`play_audio` 效果原样返回，不丢、不改顺序。
7. 对不存在的会话发事件，接口返回 404 和一句中文说明。
8. 事件不符合 `SessionEvent` 的结构时，接口返回 400，不调用 `reduce`。
9. `db:seed` 跑两次不报错，数据不重复。
10. `db:import` 只导入 `approved` 的文件（测试里放一个 `draft` 和一个 `approved`）。
11. `bash scripts/verify.sh D1` 通过。

## 不要做

- 不写编排逻辑。`reduce`、`advanceChar`、`planDay` 都是别人的任务，你只调用。
- 不做登录和权限。孩子编号直接从请求里传。
- 不做界面，除了第 1 步那个占位首页。
- 不调模型。
- 不改 `src/contracts/`。字段对不上时停下来，写进报告的“契约问题”。
- `Dictation`、`Retell`、`Essay`、`DailyReport` 这几张表本任务不建，之后的任务再加。
