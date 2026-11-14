# 任务看板

由总设计师维护。状态：未开始 / 进行中 / 待验收 / 需修改 / 待合并 / 已合并 / 阻塞。

| 任务 | 内容 | 交给 | 批次 | 前提 | 状态 | 验收记录 |
| --- | --- | --- | --- | --- | --- | --- |
| T0 | 契约：`src/contracts/` | 总设计师 | 0 | 无 | 已合并 | 当前版本 2.9（增加离线公开检索契约） |
| C1 | 编排器状态机与间隔复习 | Codex | 1 | T0 | 已合并 | `reviews/C1.md` |
| D2 | 模型调用层 | DeepSeek harness | 1 | T0 | 已合并 | `reviews/D2.md` |
| D1 | 数据库与后端骨架 | DeepSeek harness | 1 | T0 | 已合并 | `reviews/D1.md`：226341a 第二次验收通过；合并提交24ca021，main 439个测试与生产构建通过 |
| C3 | 各 Agent 的提示词与函数 | Codex | 2 | D2 | 已合并 | `reviews/C3.md`：37f04cf 通过；合并fe42e9f，main 519个测试与构建通过 |
| C5 | 护栏（原 D3） | Codex | 2 | D2 | 已合并 | `reviews/C5.md`：b9052c6 第二次验收通过；合并提交 d83a064，main 405个测试通过 |
| C2 | 孩子端界面（认字回路） | Codex | 2 | C1、D1 | 已合并 | f92b99d / main 9a30e66; 635 tests + 9 browser tests; reviews/C2.md |
| C6 | 评测脚本（原 D4） | Codex | 3 | C3、C5 | 已合并 | 04baa5d / main 58d136b; scripts accepted; live eval deferred; reviews/C6.md |
| C4 | 内容生产流水线 | Codex | 3 | D2 | 已合并 | 1b3a60e / main 9a749c3; reviews/C4.md |
| C7 | 集成：接口、编排器、Agent、护栏接通（原 I1） | Codex | 4 | C1、D1、D2、C3、C5 | 已合并 | reviews/C7.md：1baf3be通过，合并d149377；main666测试/构建、独立浏览器10项 |
| C8A | 语音接口、内存录音及文字退路 | Codex / Sol medium | 5 | C7、契约2.3 | 已合并 | reviews/C8A.md：c15bda6通过，合并6452b91；main679测试/构建，独立浏览器21项 |

| C9 | 阅读与两轮文字复述 | Codex / Sol high | 6 | C7、契约2.4 | 已合并 | reviews/C9.md：c8c98ee通过，合并6b991a0；独立/main697测试与构建、独立23浏览器 |

| C10 | 作文采访、孩子原话卡和读后反馈 | Codex / Sol high | 7 | C9、契约2.5 | 已合并 | reviews/C10.md：9747a8d通过，合并98450a1；独立/main781测试/构建，独立27浏览器，F1关闭 |

| C11A | 夜间事实汇总、复述评分与日报 | Codex / Sol high | 8 | C10、契约2.6 | 已合并 | reviews/C11A.md：0477bbb通过，合并96824eb；独立/main817测试与构建、独立27浏览器/两组对账 |

| D2B | DeepSeek现行协议、生成预算及拒答处理 | Codex / Sol medium | 8 | D2、契约2.7 | 已合并 | reviews/D2B.md：2602d69通过，合并c913f8d；独立/main867测试/构建、27浏览器及补充探针通过 |

| C8B | DeepSeek ASR/TTS可关闭适配与录音真实转码（代码阶段） | Codex / Sol high | 8 | C8A、C9、C10 | 待验收 | ab15183；root已新clone，代码阶段验收排在D2B后；真实联调仍待key |

| C11B | 家长日报/进度、默认关闭鉴权、人工复核 | Codex / Sol high | 9 | C11A、契约2.8 | 进行中 | tasks/codex/C11B-addendum.md；真实口令/接口不配置 |

| C4B | DeepSeek离线公开资料检索 | Codex / Sol medium | 9 | C4、契约2.9 | 进行中 | tasks/codex/C4B-research.md；真实key联调延后 |

## 之后的任务（全部交给 Codex；任务文件已建立，派发前冻结对应契约与scope）

| 任务 | 内容 | 里程碑 |
| --- | --- | --- |
| C8 | C8A已合并；C8B真实语音供应商及验证待定 | M1–M2 |
| C9 | 课外阅读：短文选择、阅读界面、点字查卡、讲给小问号听 | M2 |
| C10 | 作文启发：采访界面、素材卡、读后反馈 | M3 |
| C11 | 夜间批处理：评分、日报；家长端；复核后台 | M4 |

## 契约变更记录

| 日期 | 变更 | 影响的任务 |
| --- | --- | --- |
| 2026-11-13 | 初版 | 全部 |
| 2026-11-13 | 版本 2，只动 `orchestrator.ts`：`SessionContext` 增加 `hasEssayToday`、`understandQueue`、`writeQueue`、`understandAttempts`；`DailyPlan` 增加 `carryOverChars`；增加 `wrap_up_done` 事件、`SessionEventSchema`、`NextStage`、`InitContext`；`Effect` 的 payload 改为精确类型；认读答错改为进入 understand；理解答错最多两次；`stageOf` 由 reduce 维护 | C1（返工）、D1（补充说明）。D2 不受影响 |
| 2026-11-13 | 版本 2.1，只动 `llm.ts`：增加 `LlmTurnRecord` 类型（只加不改） | D2（返工时改为从契约导入） |

## 2026-11-13 验收裁决与已知欠账

- C3：维持契约2.1，不增加形近字区别字段。区别只能来自已审核的explain，没有说明时只提醒对照字形。
- 单字符schema的UTF-16限制暂缓，补充平面汉字需要整体定义长度与索引后再支持。
- 运行时内容只允许status=approved；由D1查询和C7组装输入守住。C6使用合成图片替换C3视觉fixture占位URL。
- C5：b9052c6已删除递归自查测试，第二次验收通过；负责人授权Codex执行合并（d83a064），main自查405个测试通过。
- D1：226341a第二次验收通过并合并（24ca021）；原分支404个测试、合并后main 439个测试及构建通过，事务回滚独立探针通过。C7需把模型及护栏外部调用放在数据库事务提交之后。
- 依赖审计仍有11项（含运行时Zod、旧测试工具链及新增Prisma CLI配置链）；Next告警已消除，后续另行安排依赖专项。


## 当前并行派发（2026-11-13）

- C2：独立worktree yuwen-c2-ui，按/learn入口实现，避免与D1的根首页冲突；接口数据缺口在报告列明，由总设计师统一交C7接线。
- C4：独立worktree yuwen-c4-content，离线流水线和示例使用假客户端，不调用真实模型。
- C6：C3已合并，从统一main基准e888dc9派发独立worktree yuwen-c6-evals，现已开始实现。样例与private结果隔离规则见tasks/codex/C6-addendum.md。当前环境没有已配置的DEEPSEEK_API_KEY，不伪造真实评测证据。
- 实现agent不改契约、验证脚本、reviews和看板，不合并、不推送。总设计师在独立克隆复验并写review，按负责人授权执行通过后的本地合并。


## 执行阻塞记录（2026-11-13）

三个实现agent均返回“Your workspace is out of credits”，并停止执行。C2/C4/C6的独立worktree和未提交草稿均已保留，另存tracked patch及untracked文件恢复包；没有代实现者提交或合并这些草稿。主仓代码仍为C3合并后的519测试通过基线。

负责人已选择本轮先完成C6脚本验收，真实模型评测稍后再做；缺凭据不应阻止额度恢复后的脚本开发。恢复步骤、agent标识和草稿状态见tasks/RESUME.md。额度需工作区所有者恢复，恢复前不重复启动agent或把草稿标成交付。


## 模型分配调整与恢复（2026-11-13）

负责人要求按复杂度选择性价比模型。重新查询显示普通用量允许执行，使用显式指定的新agent恢复原worktree：C2=Terra high、C4=Sol medium、C6=Sol high，当前均继续草稿。此前“额度阻塞”记录保留为历史，不代表当前仍停止。分配依据、成本口径与升档纪律见tasks/MODEL-ROUTING.md；当前agent标识与恢复说明已同步。

模型调整后的首批交付：C2 @ 9ec4086、C4 @ 725b22c均已提交且实现worktree干净，仍未独立验收或合并；C6继续执行。实现者报告的自查输出不是总验收结论。C4标准范围检查存在中文路径转义误报，临时core.quotePath=false的自查命令已在报告披露，由总设计师核对验证工具。

## 本轮独立验收与返工（2026-11-13）

C2、C4、C6均已独立克隆复验并试合并main@fe7aea0，串行四项检查通过，但生产边界探针发现上述问题，结论均为需修改。正式意见在reviews对应任务文件，原实现者返工，不由验收对话代改。并行构建资源竞争导致的初次超时已用串行复跑排除；后续全套构建统一排队。中文文件名范围检查已修复（fe7aea0），未放宽路径。

## 本轮最终合并及同步（2026-11-13）

C4@1b3a60e、C6@04baa5d、C2@f92b99d均完成第二次独立验收并按负责人授权合入main，合并提交分别为9a749c3、58d136b、9a30e66。在真实main重新npm ci并执行verify.sh，31个测试文件、635个测试及实际Next生产构建全部通过；无任务号时范围和报告检查按脚本设计跳过，各分支在独立验收中已分别通过。C2另有9项独立浏览器测试通过。契约未修改，没有代写任务实现。

GitHub远端：git@github.com:arthur618/kidedu.git。负责人已授权同步主线和任务分支。当前接续步骤见tasks/RESUME.md；C7未派发，先完成tasks/codex/C7-preflight.md设计清单。真实DeepSeek评测按负责人决定延后。前面的首次不通过、额度中断和恢复记录均是历史。

## C7正式派发与契约2.2（2026-11-13）

只新增src/contracts/session.ts，原三个契约不变：共享屏幕数据、Packet、正常unavailable/notice、稳定操作ID规则和100秒服务端/120秒客户端预算。C7获精确UI适配路径及两个内部运行时表/迁移的范围，明确幂等检查点、事务外模型、照片不落盘与重启恢复，新增验收18–24。实现使用Sol high、单agent，其他非必要工作不并行。总设计师仅改契约/任务/验收，不代写集成实现。真实模型评测仍延后。

## C7最终合并（2026-11-14）

C7@1baf3be第二次独立验收通过，F1/F2关闭，已合并d149377。独立克隆四项自查：35文件666测试、实际构建、33文件范围、报告均通过；浏览器10项及六组自编探针通过。真实main重新npm ci与verify后666测试/构建通过。无任务号时范围/报告按设计跳过，各分支已独立检查。真实模型评测仍延后。

C8–C11任务书已按集成情况建立，尚未派发；各任务开工前由总设计师补齐契约与精确scope。语音供应商尚未明确，先规划C8A接口/测试，不发真实音频。当前接续状态以tasks/RESUME.md为准；此前进行中/需修改段落均为历史。

## C8A正式派发与契约2.3（2026-11-14）

新增src/contracts/speech.ts，统一音频MIME/2MB/30秒录音、8秒服务与12秒HTTP预算、ASR/TTS结构；SpeechToText只增加可选第三参数mimeType/signal，旧调用不变。真实供应商未确定，C8A默认关闭且不搜索密钥，不使用浏览器云语音，转录只填编辑框不判正误不自动提交。Sol medium单agent实施，精确scope已冻结；root维护契约与独立验收。

## C8A最终验收合并（2026-11-14）

C8A@c15bda6第二次独立验收通过，原生media error退路F1关闭，合并6452b91。独立679测试/实际构建、17文件范围/报告、21项浏览器、自编服务/录音/原生error探针通过；真实main重装后679测试和构建通过。生产语音仍关闭，C8B待国内供应商与实际媒体验证。C9可先文字路径，不受C8B阻塞。历史的C8A进行中/需修改段落不代表当前状态，最新以RESUME为准。

## C9正式派发（2026-11-14）

契约2.4新增reading.ts及reading/retell屏幕数据，兼容旧placeholder；私有Passage快照与公共字段严格分离。Sol high单agent负责，短事务/持久幂等沿用C7，首问取审核内容经规则检查，不多调模型。负责人明确延后外部配置/真实联调，缺密钥不阻塞后续任务；本地回归及独立验收照常。验收合并后继续C10与C11，不等待再次确认。

## C9合并与C10派发（2026-11-14）

C9@c8c98ee独立验收697测试/实际构建、22文件范围、23浏览器和自编探针通过，合并6b991a0，真实main重装复验697测试/构建通过。C10契约2.5冻结，新增essay.ts和三屏数据兼容placeholder，纯编排器只授权确认作文清单后设hasEssayToday，避免实际默认入口无法到作文。Sol high单agent实施，最多5条回答、卡片连续原话、反馈来源再校验，模型事务外，外部配置/联调继续延后。

## C10首次独立验收（2026-11-14）

类型/23文件范围通过，独立迁移SQLite/真实handler与Essay/withGuard探针复现采访和反馈问句提供新拟句，F1必须修改。未把作者756测试/27浏览器自查当独立结论；为节省用量，已知必返工版本先交原Sol high agent修正，后续再新clone整套验收。main不合入C10，C11继续设计准备，外部配置/联调仍延后。

## C10合并与C11A派发（2026-11-14）

C10@9747a8d第二次独立验收通过，F1受信问题模板/旧GET及历史响应安全投影已关闭，合并98450a1。独立781测试/实际构建、23范围、27浏览器、五输出出口探针通过；真实main重装后781测试/构建通过。契约2.6冻结实际LearningOutcome和日报事实DTO，C11A由单Sol high实施；observer只在实际持久化同事务记append-only流水，历史缺覆盖诚实标记，日报仅来源受限事实。C11B等A验收后冻结，外部配置与真实联调继续延后。

## DeepSeek现行能力核实与D2B派发（2026-11-14）

负责人提供官方Chat文档并授权可行能力接入。已联网核实官方对话/图像、ASR、TTS、搜索、OCR与基础安全接口，评估见docs/DEEPSEEK-INTEGRATION.md。既有文本/图像已接，D2B由单Sol medium补预算/默认非思考/结束原因和审核，不重复SDK。语音选DeepSeek但需实际WAV转换，C8B本地适配后真实key联调单列；搜索先离线审校，不绕过approved。C11A中途额度错误已保存patch/untracked恢复包，新查询ordinaryUsageAllowed=true后原agent恢复成功；未消耗reset或换模型反复尝试。真实接口配置继续空缺。

## C8B代码阶段派发（2026-11-14）

官方语音协议核实后，精确scope和阶段边界已冻结。Sol high在独立yuwen-c4-content/task/C8B实施规范WAV内存转码、服务端固定DeepSeek适配、批准报词及复述/采访的可编辑语音录入。默认无key/未开关零网络，长作文稿不被转录覆盖，不做任意文本朗读或自动判学习结果。C8B-live仍待安全配置key与真实合成材料验证，不能假报原真实验收项完成。所有全套build/browser预约串行。

## C11A合并与C11B派发（2026-11-14）

C11A@0477bbb独立817测试/实际构建、22范围、27浏览器及自编两组来源/计量对账通过，合并96824eb，main重装817测试/构建通过。C11B契约2.8/精确scope冻结，单Sol high复用yuwen-c2-ui/task/C11B；默认无凭据入口关闭，读取公开日报，人工审计/零删除预览。D2B独立验收、C8B语音验证并行，范围分离、构建串行；可能.env.example空配置文档合并由root协调。

## D2B合并与C4B派发（2026-11-14）

D2B@2602d69独立867测试/构建、27浏览器和真实客户端合成HTTP探针通过，合并c913f8d，实际main重装复验867测试/构建通过。契约2.9新增research.ts，离线公开搜索仅产reference_only文件，不接孩子数据、不开放孩子工具、不绕过C4人工批准；C4B由单Sol medium实施。C8B已交付ab15183，root独立验收中；C11B继续实现，构建串行，真实配置仍空。
