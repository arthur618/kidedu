# 架构摘要

完整设计见两份在线文档（需要登录才能看，Agent 读本文件即可）：

- 产品设计：https://claude.ai/artifact/2Wyorkhxxe2HGqGqeonN8V
- 项目设计：https://claude.ai/artifact/TnCCxtS6QGAkadmX9z2Hdf

## 三层

| 层 | 是否接触孩子数据 | 用什么模型 | 代码位置 |
| --- | --- | --- | --- |
| 离线内容生产 | 否 | 可以用 OpenAI | `scripts/content/`、`content/` |
| 运行时 | 是 | 只用 DeepSeek | `app/`、`src/` |
| 夜间批处理 | 是 | 只用 DeepSeek | `src/nightly/`（后续任务） |

## 运行时的调用关系

```
孩子端 (app/(child))
   │  事件
   ▼
服务端接口 (app/api, src/server)  ──读写──▶ 数据库 (src/db)
   │
   ▼
编排器 (src/orchestrator)   纯函数状态机，不调模型
   │  Effect: call_agent
   ▼
Agent (src/agents)  ──▶ LlmClient (src/llm) ──▶ DeepSeek
   │  候选输出
   ▼
护栏 (src/guard)   先规则，后模型
   │  通过
   ▼
孩子端
```

要点：

- 编排器决定“下一步做什么”，它是普通代码，不是模型。
- 每个 Agent 是一个无状态函数：输入一个 JSON，输出一个 JSON，结构在 `src/contracts/schemas.ts`。
- Agent 之间不直接对话，全部经过编排器。
- 每条要给孩子看的模型输出都先过护栏。被拦下就让原 Agent 重写一次，再被拦就用兜底话术。
- 每次模型调用记一条 `Turn`（模型、token 数、耗时、护栏结论）。

## 认字回路

一个字的状态：`recognize → understand → write → review_2d → review_7d → mastered`。“会认字”跳过 `write`。精确规则写在 `src/contracts/orchestrator.ts` 的注释里。

## 目录与归属

| 路径 | 内容 | 归属任务 |
| --- | --- | --- |
| `src/contracts/` | 契约 | 总设计师，其他人只读 |
| `src/orchestrator/` | 状态机、间隔复习 | C1 |
| `app/(child)/`、`src/ui/` | 孩子端界面 | C2 |
| `src/agents/` | 各 Agent 的提示词和函数 | C3 |
| `scripts/content/`、`content/` | 内容生产流水线 | C4 |
| `prisma/`、`src/db/`、`src/server/`、`app/api/` | 数据库、后端骨架、接口 | D1 |
| `src/llm/`、`config/` | 模型调用层 | D2 |
| `src/guard/` | 护栏 | D3 |
| `evals/` | 评测脚本和样本 | D4 |

## 技术栈

Next.js（App Router）+ TypeScript + Prisma + SQLite（本地开发，之后可换 Postgres）+ zod + vitest。选它的理由是一种语言写到底，一个人能维护，契约可以直接被前后端和测试共用。

## M1 的范围

第一个里程碑只做认字回路：作业清单、认读、字卡讲解、听写对照、间隔复习。认读先用“孩子自己点认识或不认识”的模式（`mode: "self_report"`），语音识别接口留好但不实现。课外阅读、作文采访、日报是之后的任务，但契约已经包含它们的结构。
