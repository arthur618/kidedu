# 语文伴学

帮三四年级的孩子自己完成语文作业的网页应用。主线是认字，副线是课外阅读和作文启发。

这个仓库用多个编码 Agent 协作开发：

- **总设计师**（Codex）：写契约和任务文件，验收每个任务。
- **Codex**：做绝大部分任务包（`tasks/codex/`）。
- **DeepSeek harness**：只做 D1 和 D2 两个任务包（`tasks/deepseek/`）。

## 从哪里开始

| 你是 | 先读 |
| --- | --- |
| 负责人 | `docs/WORKFLOW.md`，然后看 `tasks/STATUS.md` 派发第一批任务 |
| 编码 Agent | `AGENTS.md`，然后是你的任务文件 |

## 目录

```
AGENTS.md            所有编码 Agent 的共同规则
docs/                架构摘要、协作流程
src/contracts/       契约：数据结构、Agent 输入输出、状态机类型（只有总设计师能改）
tasks/               任务文件、任务看板、各任务允许修改的路径
reports/             实现者交的任务报告
reviews/             总设计师写的验收记录
scripts/verify.sh    提交前自查，验收时也跑它
```

## 本地运行

```
npm install
bash scripts/verify.sh          # 类型检查和测试
bash scripts/verify.sh C1       # 加上任务 C1 的范围检查和报告检查
```

## 当前进度

见 `tasks/STATUS.md`。

换电脑继续项目：先读 [任务看板](tasks/STATUS.md) 和 [项目接续说明](tasks/RESUME.md)。原始交接背景见 [HANDOFF](docs/HANDOFF.md)。
\nC7认字回路已集成，main自查666测试及生产构建通过；本地孩子端入口为`/learn`。真实模型评测尚未运行，后续语音/阅读/作文/日报见任务看板。\n