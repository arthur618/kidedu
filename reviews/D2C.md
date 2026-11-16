# 验收记录：D2C 真实接口响应格式兼容

- 日期：2026-11-16；验收人：总设计师
- 提交：task/D2C @ 04c530f23ea453e1ad632278c8a3816d90a993a0
- 结论：通过。关闭已真实复现的json_object/high组合HTTP400；不代表模型教学质量全部通过。

新克隆work/review-D2C、独立npm ci含Prisma generate，固定生产2bfc791（最终04c530f仅报告），试合最新main@5c41272后亲跑完整verify：65文件1052测试/实际Next构建通过69.31秒，scope6、契约/config/依赖/Agent/护栏差异0。未采用作者输出替代复跑。

生产仅internal.ts两行：请求体格式类型联合、按provider选择DeepSeek text/OpenAI json_object。high/非思考/非流式/maxTokens、JSON.parse/stripCodeFence/Zod/两次尝试上限、refusal/finish_reason/usage/并发/取消均原样。旧两处DeepSeek格式断言等价更新，新7例真实客户端模拟端点拒旧组合/接新组合与坏JSON/空白/schema的有限纠正，不删难例或改超时。

首次独立完整复跑1051/1052：未改动的parent/http第一例beforeEach迁移初始化钩子超过原10秒；无测试体失败证据。相同环境/原超时单独复跑29项全过53.69秒；无代码、断言或超时修改，再默认完整verify全过。保留review-D2C-verify.log初次失败、parent-recheck与verify-final日志，不声称已定位到确定的宿主负载根因，也不靠放宽标准隐藏波动。

真实回测仅root持钥匙串凭据、仅公开合成材料，原生产客户端不在fetch中偷偷改格式。修复前5+1次HTTP400；修复后5样本全部HTTP200，再179公开样本94真实HTTP全部成功，无预算阻止/调用错误。实际wire保留high/text/disabled/有限maxTokens。逐例原检查结果与预算见reviews/C6-live.md，认字/阅读/作文仍未过原质量线，不因接口修好就改绿。

无UI变更，本包不重复53浏览器（C14已独验），本轮完整集成与实际构建回归通过。全部编造数据，未读.env/private/真实孩子资料，key未入文件或报告。

## 必须修改

无。首次真实发现的是root原D2B参数组合设计错误，此处更正，不将遵守原冻结任务的实现者追记为漏项。

## 后续

保留供应商高等级审核，故不使用上游JSON模式，结构保证依赖现有本地严格校验与有限纠正。C6来源判定规则的人工复核/修订、认字组词泄答、真实课文审校与孩子试用另处理；不降阈值掩盖模型问题。接口未来规则变动仍需真实小样本验证。
