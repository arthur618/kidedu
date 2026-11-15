# C11C 复述评分来源一致性

正式任务，2026-11-15。单Sol medium实现，root独立验收。C11A遵守原契约2.6已通过；本包是设计补强，处理reviews/C11A.md已记录的首问替换后评分可比性，不能倒称原作者漏做。真实接口与密钥仍留空，不调供应商、不读private、不派agent、不合并推送。

## 裁决

1. 阅读安全规则可能把Passage.question替换成受信首问，ReadingRuntime.question保存实际首问。当前nightly仍把Passage原题/原参考要点交score，孩子回答的并非该题时分数没有可比性。只能在实际首问为非空、与原题逐字相同，参考要点非空且均非空白、完成原话非空时评分。未知/缺失实际首问、模板替换、不一致、缺参考或空原话均保守不可评分；不能把原题重新发给孩子或编造参考答案。
2. 每条本日已完成复述保留sessionId/completedAt，私有来源明确eligible或不可用原因。不可评分条目直接产生现有公共status=unavailable/result=null，不调用score、不造score Turn/Step、不伪装score0。真实score0继续保留。允许正常report事实摘要，但它的latestRetellScore必须为最新完成活动的null，不能回退更早成功分数。
3. 内部SourceSnapshot增加固定scoringPolicyVersion=2及每条eligibility信息，纳入sourceVersion哈希，避免直接返回旧策略final。无需新公共DTO/表/迁移。不可评分不需要把原题/要点/原话复制入新快照；仅私有受限原因及活动标识/时间即可。保留已完成活动事实，不改变练字/作文/时长口径。
4. 仍只有显式retryFailed可重跑真正失败评分；它不能绕过不可评分规则。新来源版本不能复用旧的不合格分数或旧派生日报。合格且实际评分输入未变时仍可复用原成功step，避免重复收费；来源变为不合格后须发布null，再跑或retry仍零score调用。不改已有score/report Agent、护栏阈值和生产LLM协议。
5. 不把私有原因/原题/参考要点或原话新增到公共日报/Turn/console；家长仅复用已有“暂不可用”。不配置key，不做实际模型质量调参。

## 精确scope

src/nightly/source.ts、src/nightly/run.ts、src/nightly/README.md、tests/integration/nightly/score-eligibility.test.ts、tests/integration/nightly/helpers.ts（仅把既有合格评分用例默认question改为原题；新不一致用例须显式构造，禁止放宽原评分/复用/重试断言）；package/lock及reports/C11C.md按总规则。另允许tests/integration/nightly/facts.test.ts仅对既有合格retell的input断言增加eligible:true类型收窄；另允许空原话已complete的c用例更新标题、纳入retells并断言不合格/missing_transcript、facts.sessionIds纳入c，保留当日/approved/排序/作文/分钟与清单其他口径，不放宽评分预期；其余nightly实现只读；contracts/reviews/主scripts/看板/DB/家长/Agent只读。允许导入已合并真实模块测试，遇契约缺口找root。

## 验收

1. 实际首问相同+有效参考/原话正常评分；真实0分保留。替换/不同/空或缺首问、空参考/空白项、空原话均null，零score调用/步骤/Turn；公共/日志canary无泄漏。
2. 旧来源已有成功final/step，实际首问后来不一致时策略版本/来源变，新publication为null不复用旧分；默认/显式retry多次仍不调用score。最新不合格活动不能退回较早成功分数给ReportInput。
3. 合格活动输入未变但来源有其他新增，复用原成功评分；原事实/幂等/租约恢复/多孩子隔离与失败重试回归不放宽。不可评分原因只是内部分类，不编能力结论。
4. focused集中自审后预约独占verify C11C（包含真实build），提交后scope/contracts0/report准确。无UI不另造截图。root新clone复跑/读生产代码，问题由你返工，通过后root合并推送；真实模型质量评测继续延后。
