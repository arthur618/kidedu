# C6真实评测阶段记录（2026-11-16）

结论：未通过接口联通阶段，尚不能评估模型质量。不是全量运行。

负责人授权5元、公开合成材料，并指定钥匙串条目deepseek-api-key；密钥只在请求进程内使用，结果已做不含密钥检查。首轮char_coach/reader/essay/guard/vision_homework各1例，5次真实HTTP全部400；未把fallback当通过。另1例诊断返回invalid_request_error：response_format仅text可以与safety_check等扩展共用。

预留按高峰价和放大的请求字节/输出上限计算，每次先预留且不释放，合计0.526448元（5例0.449224+诊断0.077224），不是实际账单。厂商未返回usage，实际费用未知，不能报0元。剩余总预算仍需扣除这笔保守预留后再启动后续请求。未读私有听写，未跑全量/语音/搜索。

这是root原D2B设计要求json_object+high的兼容错误。D2C已冻结：保留high，用text传输，原JSON解析/契约校验/有限纠正继续；不降低阈值、不靠关闭审核绕过。实现者按旧任务实现不追记为漏项。修复及新clone独立验收后，在5元总预算内重跑公开小样本，再决定全量。原始合成结果见evals/results/下本日期两文件，均completeSuite=false。
