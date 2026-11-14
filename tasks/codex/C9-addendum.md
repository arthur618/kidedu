# C9 正式实施裁决（总设计师）

2026-11-14，契约2.4。原C9任务继续适用，冲突项以下文为准。外部接口配置/真实联调按负责人最新指示延后，不能以缺密钥阻塞本任务；不接真实供应商、不读private。必要本地回归和独立验收保留。

## 模块和范围

task/C9，Sol high单实现agent。允许导入已有真实模块作集成，不改Agent/护栏/LLM内部。允许路径：src/server/reading/、src/server/runtime.ts、effects.ts、http.ts、deps.ts、model.ts，app/api/session/[id]/reading/，src/db/passage.ts、passage.test.ts、readingRuntime.ts、readingRuntime.test.ts，prisma/schema.prisma及prisma/migrations/20261114_c9_reading/，src/ui/reading/、screens.tsx、service.ts、controller.ts、LearningApp.tsx、demo.ts、ui.test.ts、reading.browser.ts，tests/integration/reading/。package/lock和reports/C9.md按总规则。scopes已冻结；contracts只读。

## 选文与显示

1. 增加ReadingRuntime内部表，数据复用ReadingRuntimeSchema；SessionContext不藏活动字段。保存已批准Passage私有快照，保证后续评分有当时来源；每次对外显示/调用前再确认原Passage当前仍approved，撤销后正常unavailable，不能继续拿旧副本当已批准。
2. 只从approved列表选择，去重targetChars。今日目标为plan三组字并集；已会认集合只取ChildChar的review_2d/review_7d/mastered，不把计划/understand字说成已掌握。至少与今日目标或已会认字有一个交集；按今日交集数降序、已会认交集数降序、outOfScopeCount升序、id码点顺序选首篇。没有合适内容正常中文+quit，零模型，不造短文。
3. reading_choice=true进入reading的纯编排器转换不变。C1原call_agent reader/ask效果在C9解释为准备阅读活动：在短事务内把选定快照与reading state/命令检查点共同保存，尚不调用模型。页面只投影id/title/body/targetChars，不能把Passage整体返回。
4. 正文舒适字号、可换行，不拆成500个56px大按钮。点/选一个字只选中；通过≥56px“看看字卡”按钮查卡，另有单字输入提供等价键盘入口。卡片只读approved；缺卡不编。对照GET `/api/session/[id]/reading/card?char=字`，当前须reading/retell且字在选文正文，成功 `{status:"ok",card}`、缺卡 `{status:"unavailable"}`、非法400/状态不符409。no-store，GET不推进学习/活动，不改ChildChar。

## 复述和恢复

5. 孩子reading_done后进入retell。首问直接取approved question，不为固定文字增加模型调用；用真实checkRules的reading/keyPoints规则审查，非pass或超过60字/多句则选正常通用问（也必须规则pass）。不以可信兜底名义绕过答案泄露。初始say为正常短提示。这个结果及phase=answer与retell state/检查点原子保存。
6. POST `/api/session/[id]/reading`正文复用ReadingActionSchema，仍须C7的Idempotency-Key、总预算/同会话串行/指纹/持久重启恢复。只接受retell且活动answer/follow_up，否则409持久rejected，不能毒化quit队列。
7. 第一条回答运行真实Reader follow_up，withGuard，最多一次追问；无论next标签如何都不无限追问，保存第一条原话、history、output，phase=follow_up与命令complete原子提交。第二条回答运行Reader wrap_up，withGuard，ask最终为null；内部发retell_done到wrap_up，最后原话/历史/活动complete及completedAt必须与该状态转换和命令检查点同事务，不得出现state已走但原话丢失。
8. wrap_up把安全收尾say放notice，不能为了展示它再加状态。任何quit/time_up正常离开；未完成活动标abandoned（保留已说原话），不能冒充完整复述。已complete不被后续quit改回abandoned。模型和护栏在事务外，先有短事务检查点；重放不多数一句、不重复advance或活动完成。恢复只执行剩余外部效果，迟到模型无写权限。
9. GET session只读当前显示，不跑模型、不推进追问；刷新/同state新快照不能拿旧活动覆盖。新生产reading/retell必须ready或unavailable；契约placeholder只兼容旧演示包。可修改demo添加纯编造ready样例，不把私有参考要点塞进demo/浏览器。

## 参考要点和日志

10. keyPoints及只存在于其内的长canary不得出现在孩子HTTP数据、HTML渲染、console或错误中。公共Passage严格投影；这指真实数据，不是要求编译器schema源码里没有字段名。
11. 私有ReadingRuntime的Passage快照和原内容表允许保存参考要点，只供服务端。Turn的reader/guard输入不保存raw system/stablePrefix/GuardExtra，使用白名单元数据（activity/passsageId/step等）投影；模型候选输出也只记ok/model/tokens/latency/是否省略等安全元数据，安全展示话术在活动output里。不能改C7默认日志行为；只对本活动投影，保留每次call包括失败的计量、候选各自护栏结论和会话归属。这样C11可从活动原话和私有快照评分，不靠泄露参考要点的Turn日志。
12. withGuard的最终fallback也要经规则检查，必要时用通用问/收尾，不允许把被拦的原question作为最终兜底回给孩子。调用失败可正常完成两轮/退出；不新增供应商SDK、不填真实接口值。

## 新增验收（与原1–8一起逐项报告）

9. schema公共投影拒绝完整Passage/keyPoints，长canary测试覆盖POST/GET/查字/HTML/console/Turn；私有内容快照可存在DB但不得整体返回。
10. 阅读选择/状态/命令检查点、首问/retell状态、两次回答/完成原话有真实SQLite故障注入与重启回放；新ID不同操作和同ID并发不重复追问/丢原话，rejected不毒化退出。
11. 撤销approved后不再显示旧私有副本或调用模型；缺文/缺卡、任意字查询、首问含参考片段、模型泄露/全失败均有正常退路和Incident。
12. 正常完成不改ChildChar阶段/统计，退出未完成为abandoned，完成后退出不重算；private transcript为孩子原话（最多两条），完整ctx往返保证保留。
13. 原21浏览器+新增真实UI→真实handler→迁移SQLite→真实Reader/护栏（仅模型假）的阅读烟测；两尺寸阅读/键盘查字/退出。编造素材，不真实联调，不添加生产fake开关。更新默认演示必要数据即可，旧截图本次生成差异恢复，不越界提交。

只补有意义的本地测试，不做需要账号的接口联调。focused后一次最终verify/实际build，再串行浏览器；测试不递归verify。正式交付后root独立复验，通过后按既有授权合并/推送并继续C10，不等负责人再说继续。
