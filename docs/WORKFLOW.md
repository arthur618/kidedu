# 协作流程

三个角色：

| 角色 | 是谁 | 做什么 |
| --- | --- | --- |
| 总设计师 | Claude | 写契约和任务文件；验收每个任务；合并前给结论 |
| 实现者 | Codex、DeepSeek harness | 各做各的任务包，交代码、测试和报告 |
| 负责人 | Arthur | 启动 Agent、传递任务和结果、合并分支、做产品决定 |

## 一个任务的生命周期

1. **派发。** Arthur 把任务文件交给对应的 Agent。启动指令见下。
2. **实现。** Agent 在 `task/<任务号>` 分支上工作，交代码、测试、`reports/<任务号>.md`。
3. **自查。** Agent 运行 `bash scripts/verify.sh <任务号>`，全部通过才算交付。
4. **验收。** Arthur 把分支交给总设计师（推到 git 远端，或者在连接了项目文件夹的会话里说“验收 C1”）。总设计师检出分支，重跑 verify，逐条核对验收标准，读代码，写 `reviews/<任务号>.md`。
5. **结论。** 通过则 Arthur 合并到 `main`；不通过则 Agent 按 review 修改后重交。
6. **记录。** 总设计师更新 `tasks/STATUS.md`。

## 启动指令

给 Codex（在项目根目录）：

```
读 AGENTS.md，然后完成 tasks/codex/C1-orchestrator.md。从 main 拉分支 task/C1，做完运行 bash scripts/verify.sh C1，写 reports/C1.md 并提交到该分支。
```

给 DeepSeek harness（只用于 D1、D2，在项目根目录）：

```
先读 AGENTS.md、docs/ARCHITECTURE.md 和 src/contracts/ 下的全部文件，然后完成 tasks/deepseek/D1-backend.md。从 main 拉分支 task/D1，做完运行 bash scripts/verify.sh D1，写 reports/D1.md 并提交到该分支。
```

Codex 会自动读取根目录的 `AGENTS.md`。DeepSeek harness 不一定会，所以指令里明确要求它先读。

## 用在线链接传任务

仓库推到 git 远端后，任务文件的原始地址就是可以直接发给 Agent 的链接，例如：

```
https://raw.githubusercontent.com/<你的账号>/yuwen-banxue/main/tasks/codex/C1-orchestrator.md
```

Agent 能访问仓库时，直接让它读仓库里的路径更可靠，因为它还需要契约文件。

## 并行与顺序

| 批次 | 任务 | 交给 | 前提 |
| --- | --- | --- | --- |
| 第一批 | C1、D1、D2 | C1 是 Codex；D1、D2 是 DeepSeek harness | 契约已冻结 |
| 第二批（并行） | C3、C5、C2 | Codex | C3 和 C5 需要 D2；C2 需要 C1 和 D1 |
| 第三批（并行） | C6、C4 | Codex | C6 需要 C3 和 C5；C4 只需要 D2 |
| 第四批 | C7 集成 | Codex | C1、D1、D2、C3、C5 全部已合并 |

从第二批起所有任务都交给 Codex。DeepSeek harness 只负责做完 D1 和 D2。

每一批合并完，在 `main` 上跑一次 `bash scripts/verify.sh`，通过了再派下一批。

## 改契约

实现者发现契约有问题时，不自己改，在报告的“契约问题”里写：哪个文件哪个类型、遇到了什么情况、建议怎么改。总设计师评估后在 `main` 上改契约、写清楚变更，并通知受影响的任务。契约变更只加不删，除非所有依赖方都已确认。

## 分工

- D1、D2 由 DeepSeek harness 完成；其余任务全部由 Codex 完成。
- Codex 同时做多个任务时，每个任务一个独立的 worktree 和分支，互不依赖的任务可以并行。
- 同一个任务两次验收不过，换一档更强的模型重做。

## 数据纪律

- 仓库里只有编造的测试数据。真实孩子的照片、录音和作文放在 `data/private/`，该目录已被 `.gitignore` 排除。
- 用真实数据做评测只在本机对 DeepSeek 跑，不贴进 Codex 的对话。
