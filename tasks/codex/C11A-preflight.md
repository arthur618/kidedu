# C11A 正式裁决草稿（C10后冻结）

原C11任务中A部分适用。不得实际配置或调用外部服务；用编造数据和注入假模型完成本地能力，生产仍走现有DeepSeek客户端，无密钥时诚实降级。Sol high单实现，不派子agent，root独立验收。不改Agent/LLM/护栏内部。

## 来源裁决

1. ChildChar是当前进度，不是历史流水；plan不是完成记录。新增LearningOutcomeSchema对应内部表，真实persist_char每条一行。来源为实际更新前/后ChildChar（不能仅用可能过时ctx推断），含同操作scope/key+effectIndex唯一约束和occurredAt；流水append-only，同唯一键内容不同必须报错，不能upsert覆盖旧时间/阶段。注意D1 handleEvent返回值已过滤persist_char，不能在runtime盲读result.effects来统计。授权在handleEvent增加兼容的可选持久化observer参数：在实际persist_char处理内部将before/实际upsert返回的after/result/原effectIndex/nowIso提供给observer；runtime.transition传带command身份的存LearningOutcome闭包，所有DB写共享原事务。不能重复reduce猜结果、在事务外事后推断，不能外层改ctx。observer失败须原ChildChar/SessionRuntime/command一起回滚。覆盖C7所有真实persist_char，包括coach自动结束；独立D1调用无command可不记流水，不能伪造操作id。
2. C7新建会话的start事务内记录每会话coverage完整起点；启用前旧会话无该标记，已有局部流水也不能冒称整场完整。无活动不能冒充缺失，必须区分新且完整覆盖但零练习与历史未记录。不能给历史补造精确练习，更不能通过读取今天ChildChar覆盖旧日结果。对当前进度可独立汇总ChildChar，但不混入日统计。
3. 日期必须是真实日历日；首版时区明确支持Asia/Shanghai、UTC，计算闭开区间。LearningOutcome按occurredAt归日；reviewedChars只取stageBefore为review_2d/review_7d；practicedChars取实际事件去重，wrongChars只实际wrong；不把任何这些字段叫全掌握。
4. 会话时长仅已结束Session的[start,end)裁剪日区间，同孩子重叠区间合并再floor分钟；负区间/坏数据不能静默造数。标注为会话经过时长而非专注时长。未结束单列，不用now猜测时长。homework取当日结束会话已保存的已确认清单，保留sessionId/item原值，不伪称条目有单独完成时间。
5. 复述只取ReadingRuntime phase=complete、completedAt落本日、非空transcript，评分使用当时私有passage快照question/keyPoints与孩子原话按换行拼接；abandoned/仅计划没有分数。作文仅将EssayRuntime.phase=complete且completedAt在本日的sessionId记入completedEssaySessionIds，不自动评分、不把稿子给报告模型；不能把仍false的Homework.done偷偷改成true冒充清单确认。ReportInput.retellScore只取本日最新completedAt活动的评分（失败为null，不拿旧成功遮掩；同时间sessionId稳定序），详细结果另存retellScores。ScoreOutput.reason仅留私有步骤结果，公共retellScores统一投影为“模型评分完成，仅供参考。”，不转发自由理由文本，避免参考要点/提示注入经家长DTO/Turn/console泄出；评分数值不因此改造，通用说明不冒充模型原话。报告模型只拿契约ReportInput，不额外传参考要点/评分原始理由/作文。

## 调用、恢复与发布

6. 在src/nightly内写score/report小封装，直接复用ScoreInput/ScoreOutput/ReportInput/ReportOutput。现有C3没有score/report实现，不虚构已有函数，不改src/agents。唯一模型入口现有LlmClient，生产复用真实配置校验，provider必须DeepSeek；注入fake只在工厂测试。无有效活动不必调用模型；分数失败null，不用0代表失败。日报失败用确定性事实摘要，parentAction默认“今天不需要”，不能猜表现。
7. 用child/date/timezone/sourceFingerprint键持久化源快照、每个score和report步骤。fingerprint只含统计所需原始学习来源，排除本批处理新建的score/report Turn、job和日报，不能自我更新导致每次重跑都新版本。成功步不重调；默认相同输入直接返回已有最终结果（包括诚实fallback），显式retry-failed只重试失败步。源改变产生新版本；日报公开发布行child/date/timezone唯一，版本留存可核对。原子发布防旧任务迟到覆盖新版本。
8. 同任务并发CAS/租约保护、过期租约允许崩溃恢复；不持DB事务等模型。支持已声明单Node/SQLite试点边界并验证重启，不能宣称已验证多实例部署。模型已调用但结果未落盘时可能再次计费，这是至少一次外部调用，报告须说明，不能宣称全局恰好一次费用。
9. 每次实际调用有agent/model/tokens/cache/latency/成功或具体失败类别/源会话归属。score/report输入含私有题目要点，但Turn只保存白名单元数据，不存raw prompt/孩子原话/模型候选全文，不打印异常对象。报告调用归入确定的最新来源Session，并保留源sessionIds；零会话零调用，不伪造Session。成功/失败/超时都计量，真实D2 onTurn与同客户端并发不串记录。
10. 导出可注入run入口和显式CLI：至少childId、date，timezone默认Asia/Shanghai，可retry-failed；默认不扫整库，不绑平台、不安装实际定时任务。配置保持空缺，真实接口联调延后。DailyReport公共数据严格使用契约，事实与模型文案分开标明，真实模型文案可靠性留待专门评测。

## 范围及验收（冻结时确认）

拟scope：src/nightly/、src/db/nightly/、src/db/learningOutcome.ts及测试、src/server/runtime.ts、src/server/session.ts及session.test.ts（仅可选observer和流水事务覆盖）、prisma/schema.prisma及prisma/migrations/20261114_c11a_nightly/、tests/integration/nightly/，package脚本/锁和reports/C11A.md。具体以冻结scopes为准。不要开家长UI或修改C9/C10活动内部。

验收逐条：固定一天数据手工对账（实际练习/复习/错字/会话分钟/作业/复述来源）；跨日/双时区/重叠会话/旧覆盖缺失/无活动；重跑与显式重试、重启/故障/两孩子并发/旧发布竞争；学习流水与状态原子；模型全部失败/无凭据诚实退路、计量和隐私；真实CLI本地fake依赖烟测、默认无凭据烟测、verify实际构建。测试不递归verify；外部接口测试不做。交付精确SHA，root新clone验收通过直接合并推送，再派发C11B。
