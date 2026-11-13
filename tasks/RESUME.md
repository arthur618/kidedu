# 项目接续说明

更新时间：2026-11-13。远端：https://github.com/arthur618/kidedu 。以本文件和 tasks/STATUS.md 为当前进度；docs/HANDOFF.md 保留原始交接背景。

## 当前完成状态

main 已合入 C1、D2、D1、C3、C5、C4、C6、C2，契约仍为 2.1。

| 本轮任务 | 验收交付 | 合并提交 | 结论 |
| --- | --- | --- | --- |
| C4 内容流水线 | 1b3a60e | 9a749c3 | 二次验收通过，566 测试；输出链接不再覆盖 approved |
| C6 评测脚本 | 04baa5d | 58d136b | 脚本通过，最新组合 608 测试；密钥脱敏和原话引用修复 |
| C2 孩子端界面 | f92b99d | 9a30e66 | 二次验收通过，最终组合 635 测试含构建，浏览器 9 项 |

三个任务的完整独立验收、返工及限制在 reviews/C2.md、reviews/C4.md、reviews/C6.md。此前恢复包和首次不通过记录都是历史，不要覆盖后续提交。

## 下一项工作

1. C7 尚未开始。先读 tasks/codex/C7-integration.md、C7-preflight.md，完成总设计师的响应契约及请求重试设计，再派独立实现 agent。当前服务端仍有待 C7 替换的占位依赖，不能把通过单包测试等同于真实全链路已跑通。
2. 负责人已明确真实 DeepSeek 评测稍后进行。C6 只完成脚本验收，无真实模型通过率、费用或图片能力结论，不搜索密钥、不造结果。
3. C8–C11 的任务文件等 C7 验收后再写；语音供应商等未决项仍保留。
4. 原依赖审计欠账另行安排，不因本轮测试通过而宣称已全部消除。

## 换电脑后的 agent 开工顺序

1. 从远端 main 开始，读取 AGENTS.md、docs/HANDOFF.md、docs/ARCHITECTURE.md、docs/WORKFLOW.md、src/contracts/ 三个文件、tasks/STATUS.md、本文件和对应 review。
2. 实现与验收分开。实现者只改任务 scope 与自己的报告，不能改契约、主验证脚本、reviews 或看板；总设计师在独立克隆重新安装、复跑、读生产代码、试合最新 main 后下结论。
3. 负责人已授权总设计师直接合并验收通过的分支，并同步到本 GitHub 仓库，无需负责人执行终端命令。不要强推或覆盖另一台电脑新增的提交。
4. 使用 npm ci。临时 SQLite 测试前清除继承的 RUST_LOG；完整 verify、Next 构建、浏览器测试串行排队，避免资源竞争超时。旧机器缓存路径不可直接搬用。
5. 运行时孩子数据仍只能走 DeepSeek。真实照片/标注只在本机 data/private；环境变量、SSH 私钥、依赖目录和缓存不随 Git 迁移，本机另配，密钥不贴聊天。
6. 原对话的子 agent 已完成本轮返工，不需要在新电脑复用其标识或绝对 worktree 路径。按远端分支及 review 重新派发。

## 模型分配

C2 使用 gpt-6.1-terra high；C4 使用 gpt-6.1-sol medium；C6 使用 gpt-6.1-sol high。本轮均完成返工并由总设计师独立验收。C7 复杂度高，计划使用 gpt-6.1-sol high；暂未派发。详见 tasks/MODEL-ROUTING.md，不对未测得的实际费用作保证。
