# 项目接续说明

更新时间：2026-11-13。远端：https://github.com/arthur618/kidedu 。本文件与 tasks/STATUS.md 是当前状态；docs/HANDOFF.md 保留原始交接背景，其中旧进度不再代表现状。

## 当前状态

- main 已合入 C1、D2、C3、C5、D1；契约 2.1。最近已验收主线基线 519 测试通过。
- C2 @ 9ec4086：独立组合复验 544 测试和浏览器 7 项通过，但 reviews/C2.md 的 F1–F3 需返工，尚未合入 main。
- C4 @ 725b22c：独立组合复验 564 测试通过，reviews/C4.md 的 sheet 输出链接保护需返工，尚未合入 main。
- C6 @ b09ec2a：独立组合复验 554 测试通过，reviews/C6.md 的规范化密钥脱敏和引用误判需返工，尚未合入 main。
- C7 未开始，必须先明确 C2 的响应结构、终态、请求超时和重试幂等边界；任务见 tasks/codex/C7-integration.md。
- C8–C11 任务文件按约定等 C7 验收后再写。真实 DeepSeek 评测由负责人明确延后；不得伪造结果。

## 换电脑后的 agent 开工顺序

1. 读取 AGENTS.md、docs/HANDOFF.md、docs/ARCHITECTURE.md、docs/WORKFLOW.md、src/contracts/ 三个文件、tasks/STATUS.md、本文件及对应 review。
2. 克隆本仓库后先检查远端 main 和 task/C2、task/C4、task/C6 的最新提交，不把上面首次交付提交当作永远最新。返工提交以各分支报告和独立 review 为准。
3. 实现与验收分开：实现者只在对应任务分支和 scope 内修改，不能改契约、reviews、主验证脚本和看板。总设计师维护这些文件，在独立克隆重新安装、复跑、读代码及试合 main 后下结论。
4. 负责人已授权总设计师直接执行通过验收后的合并与本仓库同步，无需让负责人运行终端命令。不要合入尚未通过的任务代码，不强制推送，不覆盖另一台电脑新增的提交。
5. npm ci 按锁文件安装。Prisma 建临时库前清除继承的 RUST_LOG；Next 构建、全套 verify、浏览器测试串行排队，避免多个分支同时构建造成环境超时。原机器的缓存绝对路径不具可移植性，在新机使用自己的缓存。
6. 只用编造测试数据。真实照片/标注只在本机 data/private，已排除版本控制；环境变量、SSH 私钥、依赖目录及缓存不会随 Git 迁移，需要本机单独配置，不在对话贴密钥。

## 当前实现分工

| 任务 | 当前返工 agent（仅原对话有效） | 模型 |
| --- | --- | --- |
| C2 | /root/rework_c2_terra | gpt-6.1-terra high |
| C4 | /root/rework_c4_sol | gpt-6.1-sol medium |
| C6 | /root/rework_c6_sol | gpt-6.1-sol high |

新电脑不要依赖这些 agent 标识或旧 worktree 路径；按远端分支和 review 创建新的独立实现任务。费用分配原则见 tasks/MODEL-ROUTING.md。此前额度中断已恢复，恢复包只是历史备份，不要拿它覆盖后续已提交内容。
