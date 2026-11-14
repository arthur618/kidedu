# 项目接续说明

更新时间：2026-11-14。远端：https://github.com/arthur618/kidedu 。以本文件和tasks/STATUS.md为当前进度；原docs/HANDOFF.md保留历史交接背景。

## 已完成主线

- C1、D2、D1、C3、C5、C2、C4、C6、C7、C8A、C9均已合并。
- 契约2.5，共7文件：schemas.ts、llm.ts、orchestrator.ts、session.ts、speech.ts、reading.ts、essay.ts；只有总设计师维护。SpeechToText旧两参数调用仍兼容，可选第三参数提供MIME/取消。
- C7@1baf3be合并d149377，关闭照片重放/快照和取消耗时问题。C8A@c15bda6合并6452b91，关闭起播成功后的原生media error退路缺口。
- C8A全新独立克隆四项自查：38文件679测试、实际生产构建、17文件范围及报告通过；独立浏览器21项通过（C7原10+C8A原8+原生error3），自编服务/录音/Chromium探针通过。
- 在真实main重新npm ci并verify，679测试及生产构建通过。完整记录见reviews/C7.md、reviews/C8A.md，首次不通过已被后续独立验收关闭。
- C9已验收合并；C10已冻结并派发Sol high，复用yuwen-c2-ui工作树task/C10；不要重启旧任务覆盖已交付代码。

## 实际能力与限制

认字回路已接真实编排器/DB/Agent/护栏，完整逻辑用假模型验证。真实DeepSeek质量、可用型号及图片能力仍按负责人决定延后评测。

C8A完成供应商无关语音服务、API、内存录音/试听/可编辑转录、报词播放及取消/清理逻辑。**生产ASR/TTS固定null，能力false；没有真实语音供应商、硬件或识别质量验证。** 假适配器仅工厂注入测试，不设生产fake开关。音频不上数据库/日志/磁盘，只有孩子明确确认的文字才走原C7操作；不自动判认字正误。

## 下一步

1. C8B：选定负责人可用的国内ASR/TTS服务后再冻结适配任务。要验证实际编码/声学时长、真实合成数据效果、取消、鉴权/防滥用和费用；本阶段不查密钥，不调用真实音频。任务框架见C8-speech.md。
2. C9：可先用文字实现approved选文、点字查卡、复述/追问，无需等待真实语音。总设计师先冻结阅读显示和独立活动状态、精确scope；keyPoints只在服务端，不能原样返回Passage。
3. C10作文、C11批处理/家长任务书已写，均未派发。开工前仍需冻结契约/scope，不能借用C7或C8A写权限。
4. 真实C6评测与已有依赖审计欠账继续保留，不能由假模型测试代替。

## 换电脑开工

- 获取远端main，先读AGENTS、架构/流程、全部contracts、看板、接续说明与对应review。检查远端、本地分支和未提交内容，不强推，不用旧恢复包覆盖新提交。
- npm ci，按迁移初始化本机开发库，必要时导入编造seed。本地孩子端入口/learn。环境变量、SSH私钥、node_modules和缓存不随Git迁移，不把密钥发聊天。
- 临时SQLite前清除RUST_LOG；回环浏览器清除http/https/all_proxy并设NO_PROXY=127.0.0.1,localhost，使用空闲C7_BROWSER_PORT且不复用已有服务。全套verify、Next构建、浏览器串行排队。
- 编码/验收只用编造数据。真实照片、录音、作文不读进编码上下文，不发境外服务；本机private评测另由负责人安排。

## 分工与授权

实现者只改任务scope和报告，不改contracts/reviews/主scripts/看板。总设计师不代写任务实现，在独立克隆重装、复跑、读生产代码、试合最新main后裁决。负责人已授权本对话直接合并验收通过的分支并同步GitHub，无需负责人执行命令。

C8A只用一个Sol medium实现，原上下文返工一次，由root独立复验，无新增实现或审查agent。C9/C10/C11的复杂边界建议Sol high；机械操作直接工具完成。模型分配与历史见tasks/MODEL-ROUTING.md。

## 当前执行覆盖（2026-11-14）

负责人要求持续推进，外部接口配置及真实联调延后并保持空值，除非确实阻塞不可替代任务。C9契约/精确scope已冻结，复用yuwen-c2-ui worktree的task/C9；本地必要回归与root独立验收后直接合并推送，再依次C10、C11。下一步清单中“先冻结C9”已完成，原未派发叙述为历史。

## 最新执行点：C10（2026-11-14）

C9@c8c98ee合并6b991a0，独立与main697测试/构建、独立23浏览器通过，reviews/C9.md为正式记录。C10契约2.5/精确scope已冻结并派发，真实默认start=false需由确认作文清单的reduce分流实际到达作文。通过后继续C11A批处理、C11B家长鉴权/复核，计划顺序Sol high，避免共享runtime/Prisma冲突。外部配置/真实接口联调仍延后。前文C9未派发/进行中为历史。

## 最新：C10返工（2026-11-14）

C10@d14a0fb首次独立类型/范围通过，但F1问句夹带可抄句已真实复现，reviews/C10.md为正式意见。原/root/implement_c10_sol在task/C10同一worktree返工；root不代改实现，不合并该版本。修改后再独立全套检查，继续C11。前文C10进行中等叙述以此段为准。
