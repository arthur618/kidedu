# 项目接续说明

更新时间：2026-11-14。远端：https://github.com/arthur618/kidedu 。以本文件和tasks/STATUS.md为当前进度；原docs/HANDOFF.md保留历史交接背景。

## 已完成主线

- C1、D2、D1、C3、C5、C2、C4、C6、C7、C8A、C9、C10均已合并。
- 契约2.8，共9文件：schemas.ts、llm.ts、orchestrator.ts、session.ts、speech.ts、reading.ts、essay.ts、nightly.ts、parent.ts；只有总设计师维护。SpeechToText旧两参数调用仍兼容，可选第三参数提供MIME/取消。
- C7@1baf3be合并d149377，关闭照片重放/快照和取消耗时问题。C8A@c15bda6合并6452b91，关闭起播成功后的原生media error退路缺口。
- C8A全新独立克隆四项自查：38文件679测试、实际生产构建、17文件范围及报告通过；独立浏览器21项通过（C7原10+C8A原8+原生error3），自编服务/录音/Chromium探针通过。
- 在真实main重新npm ci并verify，679测试及生产构建通过。完整记录见reviews/C7.md、reviews/C8A.md，首次不通过已被后续独立验收关闭。
- C10已验收合并；C11A契约/scope已冻结并派发Sol high，复用yuwen-c2-ui工作树task/C11A；不要重启旧任务覆盖已交付代码。

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

## 最新执行点：C11A（2026-11-14）

C10@9747a8d修复F1后独立781测试/构建、23文件范围、27浏览器和五出口探针通过，合并98450a1；main重装复验781测试/构建通过。此前C10需修改为历史，reviews/C10.md顶部和第二次结论为准。契约2.6/nightly.ts与C11A精确scope已冻结，正式任务C11A-nightly.md和C11A-addendum.md；single Sol high，/root/implement_c11a_sol，原worktree的新task/C11A。原C11A-preflight已被正式文件替代。验收通过后继续C11B默认关闭的家长/人工复核；全部真实外部配置/联调仍延后，不因缺凭据停工。

## 新增接入任务与额度恢复（2026-11-14）

用户提供DeepSeek文档并授权接入可行能力，官方核实结论见docs/DEEPSEEK-INTEGRATION.md。D2B协议/预算精确scope和契约2.7已冻结，单Sol medium，复用yuwen-c6-evals工作树task/D2B。C11A曾额度中断，root保存草稿恢复包；只读账户显示普通用量允许，原/root/implement_c11a_sol恢复成功，仍继续原task/C11A。全套build/browser由root排队。后续C8B语音适配（供应商已选DeepSeek）与C4B离线检索再冻结，不把无密钥假HTTP验收当真实联调通过。

## 新增C8B代码阶段（2026-11-14）

正式任务C8B-deepseek.md已冻结，独立yuwen-c4-content工作树task/C8B，/root/implement_c8b_sol（Sol high）。保留原C8A限制与27浏览器；真实转码、短回答编辑输入和approved报词，不配置key，不把本地fake验收当真实供应商通过。C11A@0477bbb与D2B@2602d69已作者交付，root当前独立验收，尚未合并。主线仍C10通过后的781基线加契约/文档。

## 最新：C11A已合并，C11B/D2B/C8B（2026-11-14）

C11A@0477bbb合并96824eb，root独立与main817测试/构建、独立27浏览器/两组对账通过。D2B@2602d69正独立试合主线；C8B在yuwen-c4-content/task/C8B做代码阶段验证，真实key/live仍空。C11B契约2.8与scope正式冻结，yuwen-c2-ui/task/C11B，/root/implement_c11b_sol（Sol high）。旧preflight被正式任务替代，不重启已完成C11A。所有全量build/browser找root排队，原稿备份不覆盖新主线；.env.example只空值。

## 2026-11-14 当前接续：D2B已合并、C8B独立验收、C11B/C4B实施

main c913f8d已复验867测试与实际构建；本提交冻结契约2.9。C8B ab15183待root独立复验，C11B由implement_c11b_sol继续，C4B单Sol medium复用已接受D2B工作树。key/口令全留空，真实DeepSeek质量/计费/硬件验证仍延后。不要重做已合并包，不读取私有数据。

## 最新：C8B代码已合并（2026-11-14）

main aad4e27重装复验887测试/构建通过，C8B正式结论见reviews/C8B.md；独立浏览器33项通过，真实ASR/TTS验证仍未做。D2B已合并，C11A已合并。C11B /root/implement_c11b_sol在yuwen-c2-ui/task/C11B，C4B /root/implement_c4b_sol在yuwen-c6-evals/task/C4B；最终全套build/browser必须先预约root串行窗口。不要重启已接受包，未验收分支不合并。main及通过分支由root直接同步GitHub。

## 最新：C4B已合并、C11B修复中（2026-11-15）

main5bf3bbe重装948测试/实际构建通过，C4B已独立验收，见reviews/C4B.md；真实检索live待key。C11B@770cad9阶段检查发现登录慢body跨窗口限速F1，见reviews/C11B.md；原/root/implement_c11b_sol已修并focused27通过，等待最终verify/browser及root新clone独立验收，不得提前合并。昨天额度中断草稿备份在root工作区work/20261115-agent-backups；今日ordinaryUsageAllowed=true后只恢复原agent一次，未用reset。全部接口/口令留空。

## 最新：家长已合并、评分修正待验收、刷新恢复实施（2026-11-15）

main7d8addc复验976测试/构建通过，C11B正式review顶部通过，历史F1已关闭。当前冻结契约2.10；C11C@3eff287在root/work/review-C11C与家长主线试合验收，无需作者重复build。C12复用已接受C8B工作树yuwen-c4-content/task/C12，单Sol high /root/implement_c8b_sol；正式任务tasks/codex/C12-client-recovery.md。root维护契约/独立验收，不写实现，全套重型串行。真实接口配置和联调仍延后。

## 最新：评分来源补强已合并，C12继续（2026-11-15）

main71ff1db重装复验992测试/实际构建通过，C11C正式review通过，旧不合格评分不能被复用。C12在yuwen-c4-content/task/C12由/root/implement_c8b_sol（Sol high）进行，基线1aabdfe；最终重型前合最新主线。root独立验收，不代实现。原/root/implement_c4b_sol已完成C11C不再重跑，真实key/live仍空。

依赖既有欠账已在线复核仍11项，原/root/implement_c4b_sol（Sol medium）只读研究，草稿work/C13-dependency-preflight.md在root工作区；未授权改锁/实现。C12原high agent继续，不受预检阻塞。

## 最新：C12恢复实现与C13隔离准备（2026-11-15晚）

main仍992测试/构建基线；C12阶段fc334dc已保存，原/root/implement_c8b_sol恢复，在task/C12补真实浏览器。C13预检已存docs/audits/C13-preflight.md并冻结正式任务，/root/implement_c4b_sol复用Sol medium独立分支先准备安全依赖；C12合并后才能做C13最终组合验证，不移动C12契约2.10。Zod4迁移尚未冻结，不能提前改contracts。源码不放真实key/数据，所有重型先找root排队。
