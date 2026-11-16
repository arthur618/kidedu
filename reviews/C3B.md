# 验收记录：C3B 组词提示避免完整泄答

- 日期：2026-11-16；验收人：总设计师
- 分支提交：task/C3B @ 8ae2715516fda8e2f7c241ebf1669348a3e6abc5
- 结论：通过，关闭真实合成char_coach-20完整词泄答问题；不宣称C6质量全过。

新克隆work/review-C3B，独立npm ci含Prisma generate，固定生产2b016c5后亲跑verify C3B：66文件1076测试/真实Next生产构建通过67.26秒，scope4/契约0；tracked与实际收集66集合相等。最终8ae2715仅报告变化，已检查。旧测试零改动，新24例完整执行。

## 生产代码与独立探针

读取index/fallback：保留runAgent和原模型调用，在make_word返回前按最后一条role=child、say+ask检查完整card.words连续字面出现。孩子最近未逐字提供的完整词换为固定提示/等待；合法escalate保留，带泄答的escalate投影固定unknown话术。首词不足2字时fallback不用完整字作“首字”提示。其他步骤、错误兜底、来源字段与契约保持；无新请求/重试/全局副作用。

独立probe-C3B.mts使用真实coachOutput→measuredClient→临时迁移SQLite，注入原危险候选，确认输出无完整答案、next仍wait_child、仅1条原合成用量Turn、不修改输入和ChildChar学习状态。ask单独泄答、过早历史不当最近来源、已由孩子提供的词确认、危险escalate等独立边界通过。这个探针的模型是合成替身，计量记录不代表实际付费。

## 真实定向回测

root使用同一钥匙串凭据、原LlmClient、公开char_coach-03/20/24三例，无fetch改写产品请求，HTTP均200，3次实际模型调用，输出未直接给完整词；返回usage按高峰未缓存价估0.005544元。本轮仍有03/20被原card_grounded判失败（引用当前学习字或孩子已说的“木头”），没有改阈值或改写旧结果，也不把本次3例当全量通过。原候选的确定性拦截由独立服务链探针证明，不以随机模型本次没泄答替代回归。

与此前整个真实评测合计保守计量0.676406元（含原6拒绝请求无usage保留0.526448预留），5元上限未触及；实际账单未核对。key只在root请求进程内，不在文件、参数、报告或实现agent中。证据review-C3B-{install,verify,probe}.log、collected JSON及C6-live-post-C3B-target.{json,log}，公开合成结果归evals/results。

## 必须修改

无。

## 边界

这是已知字面完整词泄答的窄修复，不是通用语义评判器；不保证任意拆字/隐晦拼写的答案都能检测。未放宽原提示词、评测或护栏，仍不替代内容人工终审。无UI变更，不重复全浏览器；本轮完整集成/构建与真实服务链探针通过，上一轮C14已有独立53浏览器。
