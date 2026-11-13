# 后端接口说明（任务 D1）

三个接口都在 `app/api/session/` 下。孩子编号从请求里传，没有登录和权限。

## 本地启动

```bash
npm install
cp .env.example .env          # 里面已有 DATABASE_URL=file:./dev.db
npm run db:migrate            # 应用 prisma/migrations 里的建表脚本
npm run db:seed               # 写入编造的演示数据
npm run dev                   # 打开 http://localhost:3000
```

`npm run build` 会做生产构建。数据库地址只从环境变量 `DATABASE_URL` 读，密钥也只从环境变量读。

## POST /api/session

开始一次学习。服务端读出孩子的全部字和这一课的字，调用 `planDay` 得到当天计划，准备计划里每个字的
`stageOf` / `kindOf`，调用 `initContext` 得到初始上下文，新建会话，再发送 `start` 事件。

请求：

```json
{
  "childId": "child-demo-1",
  "lessonId": "lesson-demo-g3-1",
  "hasEssayToday": false
}
```

返回 200：

```json
{
  "sessionId": "session_0f1c2d3e-....",
  "state": "homework_capture",
  "effects": [{ "type": "show", "screen": "homework_capture" }]
}
```

孩子或课不存在返回 404；请求结构不对返回 400。

## POST /api/session/[id]/event

发送一个 `SessionEvent`。接口直接用契约里的 `SessionEventSchema` 校验（`src/contracts/orchestrator.ts`），
然后读出状态和上下文，调 `reduce`，在同一个数据库事务里执行持久化效果，再把不处理的效果原样返回。

请求：

```json
{ "type": "recognize_result", "char": "山", "result": "correct", "mode": "self_report" }
```

返回 200：

```json
{
  "state": "understand",
  "effects": [{ "type": "show", "screen": "understand", "data": { "char": "山" } }]
}
```

会话不存在返回 404；事件结构不符合 `SessionEventSchema` 返回 400，而且不会调用 `reduce`。

## GET /api/session/[id]

返回当前状态、上下文和作业清单。顶层 `homework` 取自当前运行时上下文，和 `context.homework` 一致；
孩子中途刷新页面也能看到刚确认的清单。

```json
{
  "sessionId": "session_0f1c2d3e-....",
  "state": "recognize",
  "context": {
    "sessionId": "session_0f1c2d3e-....",
    "childId": "child-demo-1",
    "today": "2026-11-13",
    "plan": { "newChars": ["山", "水"], "reviewChars": [], "carryOverChars": [] },
    "hasEssayToday": false,
    "queue": ["山", "水"],
    "understandQueue": [],
    "writeQueue": [],
    "understandAttempts": {},
    "stageOf": { "山": "recognize" },
    "kindOf": { "山": "write" },
    "homework": [],
    "elapsedMinutes": 0,
    "limitMinutes": 30
  },
  "homework": []
}
```

会话不存在返回 404。

## 会话状态存在哪

- `Session` 表只存契约里的字段：`id`、`childId`、`startedAt`、`endedAt`、`homework`。
- 状态机的 `SessionState` 和整个 `SessionContext` 存在单独的 `SessionRuntime` 表里，一个会话一行：
  `sessionId`、`state`、`context`（JSON 字符串）。
- `handleEvent` 把 `reduce` 返回的 `ctx` 整个存成 JSON，下次整个读出来传回 `reduce`，不裁剪、不补字段，
  也不在两次事件之间更新 `stageOf`。
- 一次事件的 ChildChar、Session 和 SessionRuntime 写入在同一个数据库事务里：全部成功才提交，
  中途失败全部回滚。`getPrisma()` 在事务里自动返回同一个事务客户端（AsyncLocalStorage）。

## 编排器还没正式接线时

`src/server/deps.ts` 现在导出会抛“C1 尚未合并”的 `reduce`、`advanceChar`、`planDay`、`initContext` 占位函数。
实际接线由任务 C7 完成：把该文件顶部四个常量改成从 `src/orchestrator/`（或 `@/orchestrator`）导入即可，接口层不用改。

## 数据访问层

`src/db/` 里每张表一个文件。函数入参和返回值都是 `src/contracts/schemas.ts` 里的类型，不暴露 Prisma 类型；
每行读出后都用对应的 zod schema `parse`，坏数据会抛 `ContractDataError`（带表名和主键）。
`Lesson`、`CharCard`、`Passage` 的读取函数默认只返回 `status === "approved"` 的行。
