# C9 课外阅读与复述

- 状态：未派发；建议Sol high单独实施。
- 前提：C7已合并；文字复述可先于真实语音，语音可用后复用C8。
- 总设计师先冻结阅读显示数据、独立ReadingRuntime及精确scope，保持SessionContext原样往返纪律。

## 目标与流程

1. 从approved Passage选一篇与本次学习字/已学字匹配的短文；规则可解释且稳定，不让模型现场编故事。没有合适内容时给正常提示与退出，不能造approved短文。
2. reading_offer接受后显示标题/正文，点字只查approved CharCard；缺卡不编释义。正文适合手机与平板阅读，不做打卡、评分或奖励。
3. 读完到retell，先支持文字输入；调真实reader，首次问题来自审过的question，最多一次follow_up，再用wrap_up收尾。每次孩子可见say/ask经过withGuard，keyPoints只供服务端输入。
4. 复述文字及对话进度存独立内部运行时，不塞进SessionContext。沿用C7操作ID、串行、短事务、外部效果与恢复规则。
5. 前端响应、HTML、日志及错误里都不能带keyPoints。Passage数据库schema允许keyPoints不意味着可以原样返回浏览器。
6. 评分留给C11，不给孩子显示分数。不能因复述不理想困住收尾或退出。

## 拟定路径

src/server/reading/、app/api/session/[id]/reading/、src/ui/reading/、现有screen适配、tests/integration/reading/；必要内部表及迁移由总设计师明确加入scope。原Agent/护栏/LLM只调用，不改内部。

## 验收要求

1. 真编排器、临时库、reader、护栏，只有模型假；选择→阅读→点字→复述→追问→收尾到ended。
2. 选择只返回approved；排序与缺内容行为有正反例，不推断未学字为已掌握。
3. 公共响应和页面全量检查不含keyPoints，诱导要答案的输出被护栏拦截并可信兜底。
4. 追问次数、刷新、响应丢失、同ID并发、重启恢复不多推进一次。
5. 模型全失败仍有原问题/可信话术，能正常收尾，无500；退出无后台迟到覆盖。
6. 每次调用Turn归属、tokens与护栏候选正确，不把失败兜底算模型成功。
7. 375×667与1024×768浏览器流程、键盘和触控区域验证；无横滚，无技术报错。
8. verify与真实构建通过，报告写明选文规则和剩余真实模型质量限制。
