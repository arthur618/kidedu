# D1 返工：当前契约与会话数据一致性

- 交给：原D1实现对话（DeepSeek harness）
- 分支：继续task/D1；当前交付7991c04
- 允许修改：保持tasks/scopes.json中D1的范围，不改契约、scripts、reviews和看板
- 先读：reviews/D1.md、最新main上的tasks/deepseek/D1-addendum.md、src/contracts/全部文件

本文件由总设计师维护。它补充原D1任务与addendum，未列出的原验收标准继续有效。不要自行合并到main。

## 必须完成

1. 把最新main合入任务分支，以当前契约编译。按addendum四点落实：事件直接复用契约SessionEventSchema；新建会话注入InitContext；ctx整体原样存取；persist_char缺记录时按kindOf构造初始ChildChar，再advance并保存。
2. 更新所有测试fixture的DailyPlan和SessionContext，不能用any或断言隐藏版本不兼容。补齐addendum的12–15条测试，尤其计划同时包含newChars、reviewChars、carryOverChars时，每个字都有正确stageOf/kindOf。
3. 一次handleEvent的持久化效果和SessionRuntime状态/上下文必须共同提交或回滚。实现放在D1允许范围内；保证数据库事务内依赖也使用同一事务客户端。外部效果仍按约定返回，不在此任务接模型。不能只吞异常、只回滚内存或重写ctx。
4. GET /api/session/[id]的homework必须反映当前运行时清单，与返回context.homework一致。修正旧测试把空快照当正确值的断言。
5. 更新Next及相关React/RSC运行时依赖和锁文件至交付时已经修复已知公告的兼容版本。原报告“必须跨大版本”不准确：2025-12-11公告已提供15.5.x内的补丁。核对后续公告，不把旧公告修复版本当作当前安全保证；不要求顺带解决所有历史开发依赖问题。
6. reports/D1.md增加“契约版本2的调整”，逐条说明12–15；更新接口说明、当前依赖版本和检查输出。保留实际编排器接线给C7，D1只注入契约依赖及占位实现。

## 新增验收标准（原1–15继续有效）

16. 临时SQLite故障注入：persist_char成功后、SessionRuntime写入时失败，断言ChildChar、Session、SessionRuntime均没有部分提交；故障消除后重试，仅累计一次结果。增加包含多条persist_char时后续写失败的用例。
17. 用事件更新清单及完成状态后重新GET，顶层homework与当前context.homework深度相等，进度不丢失；ctx其他字段不被修改。
18. 依赖修复提供当前公告/审计与锁文件实际版本证据；直接执行npm run build、bash scripts/verify.sh D1均成功。命令证据写在报告，不在测试里递归执行verify，也不要用忽略类型检查/忽略安全警告代替修复。

第16、17条需要回归测试；第18条用实际安装、构建、自查和公告/审计结果验证。已有build.test.ts不递归执行测试，可以保留；类型检查和测试不得跳过。

## 交付

仅在task/D1提交实现、测试和reports/D1.md；不要改本文件或review。把新提交号交回总设计师独立复验，负责人决定何时合并。
