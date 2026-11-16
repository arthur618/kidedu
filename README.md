# 语文伴学

帮三四年级的孩子自己完成语文作业的网页应用。主线是认字，副线是课外阅读和作文启发。

这个仓库用多个编码 Agent 协作开发：

- **总设计师**（Codex）：写契约和任务文件，验收每个任务。
- **Codex**：做绝大部分任务包（`tasks/codex/`）。
- **DeepSeek harness**：只做 D1 和 D2 两个任务包（`tasks/deepseek/`）。

## 从哪里开始

| 你是 | 先读 |
| --- | --- |
| 负责人 | `tasks/RESUME.md` 和 `tasks/STATUS.md`，再读 `docs/WORKFLOW.md` |
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
npm ci
bash scripts/verify.sh          # 类型检查和测试
bash scripts/verify.sh C1       # 加上任务 C1 的范围检查和报告检查
```

## 当前进度

见 `tasks/STATUS.md`。

换电脑继续项目：先读 [任务看板](tasks/STATUS.md) 和 [项目接续说明](tasks/RESUME.md)。原始交接背景见 [HANDOFF](docs/HANDOFF.md)。
认字、阅读与文字复述、作文采访和原话素材、夜间事实日报已集成，孩子端入口为`/learn`。DeepSeek对话协议与可关闭的ASR/TTS代码已接入；离线公开资料检索也已接入，仅保存待人工核对的参考文件。家长鉴权、只读日报/进度和有审计的人工复核已集成，默认入口关闭。评分仅在实际首问与参考来源一致时进行。浏览器刷新可续接已提交的会话与操作，未发送草稿不跨刷新保存。main的1045个测试和实际生产构建通过，最新独立浏览器53项通过。C13/C14依赖维护已合入，官方在线审计当前锁零已知告警。真实模型与语音联调延后，凭据留空，生产语音默认关闭。能力评估与官方来源见[DeepSeek接入说明](docs/DEEPSEEK-INTEGRATION.md)。

后续见[实际验证计划](tasks/VALIDATION.md)：合成材料真实评测、前两课内容审校、家长陪同孩子试用。仓库保持公开。
