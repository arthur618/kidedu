# C11B 家长日报、进度、鉴权及人工复核
+
+- 状态：已派发，task/C11B，Sol high单agent。C11A已验收合并，契约2.8和精确scope冻结。
+- 必须完整读[C11B-addendum.md](C11B-addendum.md)，优先于原C11规划/旧preflight。
+- 实现者不改contracts/reviews/看板/主scripts，不合并推送、不再派agent。所有数据编造，真实凭据/接口继续空缺，不读private/实际密钥。
+
+## 验收1–8
+
+1. 默认未配置关闭，公开status无孩子信息；真实本地假配置登录/限速/过期/伪造/退出/配置变更失效，cookie安全属性及CSRF。
+2. 每个列表/详情/进度/复核/预览均先鉴权/按真实归属授权；跨孩子所有ID、孤儿/矛盾来源不能读写，不返回raw Turn/私有活动/媒体/凭据。
+3. 日报只读C11A公开产物，0分与null区分，事实/模型参考/历史覆盖状态中文说明；当前进度分阶段总数与分页准确，不触发模型/改学习数据。
+4. Incident与可信Session/Turn关联；旧缺归属诚实隐藏，人工resolved使用稳定ID/指纹/revision CAS、事务审计；同值不伪造审计，双击/并发/重放正确，不跳过C4终审。
+5. 删除仅范围预览、executable=false，完整计数与引用说明，零删除、无隐式保留期清理。
+6. 真实UI→handler→迁移SQLite两尺寸+键盘、分页/切孩子/退出，迟到响应不串孩子/注销状态；默认closed同样可用。
+7. 只假配置/编造数据，客户端静态包无key/口令；HTTP/console/错误无媒体或原始内部异常，生产无fake绕过开关。
+8. focused与集中自审后最终verify含实际build、全浏览器串行、提交后真实scope/报告，明确单户试点边界与真实配置未做。
+