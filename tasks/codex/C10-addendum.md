# C10 正式实施裁决（总设计师）

契约2.5。原C10任务适用，冲突项以下文为准。外部接口配置与真实联调延后；所有文字测试编造，不读private，不添加供应商/生产fake开关。总设计师只维护契约、任务和验收，实现交Sol high单agent，不自行派agent。

## 活动与孩子操作

1. 真实孩子端start默认hasEssayToday=false，不能只在测试里强设true而让实际作文入口不可达。按契约2.5，在纯reduce的homework_confirmed中设hasEssayToday=ctx.hasEssayToday || items.some(kind=essay && supported && text.trim非空)；只由reduce产生ctx，不在外层修改。精确授权reduce.ts及对应测试作这项路由接线，其余状态规则不改。从ctx.homework按原顺序取首个合法作文条目作主题；初始flag=true但无合法条目时，正常unavailable+退出，不编主题。开始时间用deps.now；独立EssayRuntime保存主题、来源作业id、孩子原话/素材卡/正文/历史，不修改ctx来藏活动进度。采用契约EssayRuntimeSchema。
2. 开始essay_interview时，活动初始数据与状态、命令检查点在短事务内原子准备，再在事务外运行真实essay(interview)+withGuard，完成显示与活动output/history共同提交。不在GET里调模型。每个问题只问一件事，不提供示范句。
3. POST `/api/session/[id]/essay` 使用EssayActionSchema和Idempotency-Key。answer仅interview可用，最新孩子话trim后保存在utterances；真实essay输入history最后一条必须是这次child。最多5条孩子回答（不是5次模型重试）；每轮最多一张新卡，不去重计数冒充新收集。无论模型next如何，不让模型无限延长：孩子可随时“这些够了”发essay_step_done，或第5次回答自动进essay_cards。最后原话/卡与状态/命令检查点须原子，故障重放不丢原话、不多卡。
4. newCard必须非空、非纯空白且为最新原话的逐字连续子串，newCard不能来自旧child、agent、已有cards的拼接；不能仅依赖Agent内部检查。withGuard最终输出合格后再验newCard，不合格置null，不替换/润色成别的字串。没有新卡时保持原卡，不能称已成功提取。卡id稳定、sourceUtterance对应原话索引，selected初始true。
5. essay_cards显示“你的想法/你的原话”，只支持选择和删除，不提供服务器生成/改写卡的API；select_card/delete_card仅cards状态且真实id可用，未知卡409，删除后同操作重放原响应，不把旧索引误删新卡。未选卡仍保留；deleted卡从活动cards移除但原utterance保留，避免丢来源。
6. 作文孩子自己写；首版文字输入。submit_essay仅cards状态，trim后非空、最多10000字；空白400且原状态不变，页面正常提示并可退出。保存essayText、包含这次child的history、phase=feedback与内部essay_step_done/state/命令检查点同事务；后续真实essay(reader_feedback)+withGuard在事务外，只执行剩余效果。通用event不能越过未提交正文直接从cards进feedback，409不毒化quit队列。
7. 反馈严格只有一处“我看见了”原文和一个“我还想知道”问题：say仅允许 `我看见了：“<quote>”`（可末尾一个句号），quote非空白、1–40字、不能含嵌套引号/换行，且是essayText逐字连续子串；ask必须非空、单个问题、最多60字。服务器再次验证；withGuard的childLastUtterance用本次essayText，不能把模型自造引文当孩子话。任何违约候选同样走blocked/Incident和重试，最后可信兜底只引用正文实际短片段并规则再检；没有安全片段则正常unavailable，不假装看见、不提供范文。反馈newCard强制null；不把作文评分呈现给孩子。
8. 反馈后“先写到这里”发essay_step_done到wrap_up；phase=complete/completedAt与转换/检查点同事务。任意quit/time_up标未完成活动abandoned（原话保留），complete不被后续退出改写。活动不得改ChildChar阶段和统计。

## 恢复、隐私与显示

9. 完整沿用C7/C9同会话串行、指纹、持久prepared/transitioned/complete/rejected、预算/取消。所有状态/活动完成在同一短事务，外部模型/护栏不持锁。新请求先恢复旧检查点，rejected不毒化退出，迟到模型不改活动/状态/Turn。GET同state只读当前活动，不拿上一轮快照遮盖新卡/问句；重放保存原历史响应，不能推进新问题。
10. 公共屏幕只投影契约字段，不整体返回EssayRuntime。feedback只投影一处短引用；essayText全文与原utterances只在私有活动表。孩子自己的输入编辑框、明确提交的卡文字和契约规定的一处短引用允许展示；它们不意味着可以把整个私有活动/正文回送。沿用C9活动Turn元数据白名单：保留每次调用的agent/model/tokens/latency/成败/候选护栏/session，不记raw system/user/history/essayText/候选作文，console和错误无正文。只有活动本身保留孩子原话供后续C11汇总，不放公开fixture之外的真实作文，不存录音/照片。
11. 新生产essay三屏必须ready或unavailable，placeholder只兼容旧演示。按钮触控≥56px、语义标签、无横滚；作文输入大而可编辑，不加打分、打卡、好词好句或倒计时施压。复用现有语音hook时默认关闭，不能强依赖它；纯文字闭环须完整。

## 验收与范围

允许真实模块导入作集成，不授权修改Agent/护栏/LLM内部；contracts由root维护。冻结精确scope：src/orchestrator/reduce.ts及reduce.test.ts（仅上述确认作业路由）、src/server/essay/、src/server/runtime.ts/effects.ts/http.ts/deps.ts/model.ts、app/api/session/[id]/essay/、src/db/essayRuntime.ts及测试、prisma/schema.prisma及prisma/migrations/20261114_c10_essay/、src/ui/essay/、src/ui/screens.tsx/service.ts/controller.ts/LearningApp.tsx/demo.ts/ui.test.ts/essay.browser.ts、tests/integration/essay/；package/lock/report依总规则。

除原1–8标准，再核对：

9. 真实SQLite故障点覆盖开始、最后回答转cards、提交正文转feedback、完成；重启、新ID接续、同ID并发、指纹冲突不丢原话/多卡。ctx额外字段原样往返。
10. 最多5次孩子回答，提前结束、无卡、空正文、未知卡、主题缺失、模型全失败/超时、退出均有正常退路；错误不毒化退出。
11. 任意引用、润色/拼接/旧消息卡不保存，反馈不存在的引文/多引文/无问题/长陈述/索要范文至少6表达被挡；fallback也有规则/来源校验。失败计量和Incident不伪造成功。
12. API响应/HTML/Turn/console/错误不整体泄露私有活动和正文（允许孩子正在编辑的输入、明确卡片和一处短引用）；选删卡立即刷新准确，删除不改原utterance，正常完成不改ChildChar。
13. 原有全部浏览器加新真实UI→真实handler→迁移SQLite→真实essay/护栏（仅模型假）两尺寸流程；必须包含默认start=false、确认作文清单后实际进入作文，不可手动改状态冒充入口已接通。键盘、触控、退出。集中自审和focused后一次最终verify/实际build，浏览器串行，不做真实接口测试。报告逐条对应原1–8和新增9–13。

独立验收不采信作者输出，root新clone重装/复跑、读生产代码，问题正式写review由原实现者改。通过则按既有授权合并推送并继续C11，不等负责人再次确认。
