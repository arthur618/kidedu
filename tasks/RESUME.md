# 并行任务恢复说明

更新时间：2026-11-13。总设计师：本独立验收对话；实现与验收继续分开。

## 此前阻塞与当前恢复

C2、C4、C6三个agent均因工作区额度耗尽而终止，系统原文：`Your workspace is out of credits. Ask your workspace owner to refill in order to continue.`

所有实现草稿已保留在原worktree，没有提交、没有验收、没有合并。不要把报告草稿或先前的试跑当作最终交付证据。当前已按负责人要求以明确指定的模型创建新的恢复agent，继续原worktree，旧errored agent不再启动。分配见tasks/MODEL-ROUTING.md，无需负责人执行终端命令。

## 实现agent与工作目录

| 任务 | Agent | Worktree | 分支基线 |
| --- | --- | --- | --- |
| C2 | /root/resume_c2_terra | /Users/lihao/.codex/worktrees/yuwen-c2-ui/yuwen-banxue | task/C2，3b96d06 |
| C4 | /root/resume_c4_sol | /Users/lihao/.codex/worktrees/yuwen-c4-content/yuwen-banxue | task/C4，3b96d06 |
| C6 | /root/resume_c6_sol | /Users/lihao/.codex/worktrees/yuwen-c6-evals/yuwen-banxue | task/C6，e888dc9 |

## 已落盘与待做

- C2：15个未跟踪的界面、控制器、适配器、图片工具和测试文件，及package修改。没有最终报告或任务提交。发现`.gitignore`也被修改，它不在C2范围，恢复时实现者需自行核对并撤销这项越界改动（不要丢失界面草稿）。继续补齐截图、全部测试、报告与交付。入口/learn，不能与D1的根首页冲突；show.data及homework/coach接口缺口须在报告列明，交C7接线。
- C4：18个未跟踪的流水线、CLI、检查函数、测试、示例、README和报告草稿，及package修改。继续完成“人工Lesson也能check→review→approve”的闭环测试，核对所有approved保持原字节，完整自查后提交；不能只相信现有报告草稿。
- C6：8个未跟踪的检查函数、类型、阈值和case文件；尚缺运行器、CLI、diff、测试、README和报告等交付。先重读tasks/codex/C6-addendum.md，守住模型失败不能借兜底算通过、private结果隔离和样例迁移裁决。

## 恢复规则

1. 先检查各worktree现状，保留草稿；恢复包仅作后备，不要覆盖后来新增的工作。
2. 本轮由负责人选择“先完成脚本验收，真实评测稍后”。实现者不搜寻其他位置的密钥、不发真实模型请求；C6第7条如实记录待运行。
3. 每个agent仅在自己的task分支完成允许范围的实现、meaningful测试及reports/<任务>.md，不改契约、reviews、验证脚本、看板，不合并或推送。
4. 真正交付后，主验收对话在独立克隆重新安装、重跑verify、读生产代码与全部标准、试合最新main并写review。通过后按负责人授权执行本地合并，合并后重跑检查。
5. C7等这批报告明确接口和数据需求后，再由新的实现agent接线。总设计师不代写任务实现。

## 恢复快照

项目对话输出目录：/Users/lihao/Documents/Codex/2026-11-13/claude-1-docs-handoff-md-2/outputs/recovery/

每个C2/C4/C6-wip.tar.gz都包含MANIFEST.json、tracked.patch及untracked/文件，已核对归档条目数。未收集node_modules、构建缓存、环境变量或任何真实孩子数据。原worktree保持原样，没有归档删除。

当前模型：C2=gpt-6.1-terra/high，C4=gpt-6.1-sol/medium，C6=gpt-6.1-sol/high。新agent已恢复执行，草稿和后备归档均继续保留。
