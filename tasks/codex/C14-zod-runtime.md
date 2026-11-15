# C14 Zod运行时安全迁移

正式任务，2026-11-15。前提C13已合入且main复验通过，root已冻结契约2.11。单Sol medium实现，root新clone独立验收；不派agent、不改契约、不合并推送、不配置真实接口。

## 目标与依据

当前实际Zod3.25.76仍命中[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)。官方修补为4.6.6及以后；本包精确固定**4.6.7**（root核对官方registry及[release](https://github.com/colinhacks/zod/releases/tag/v4.6.7)）。按[官方迁移指南](https://zod.dev/v4/changelog)真正使用Zod4实现，不能包升级后继续导入zod/v3，也不能忽略告警或调低severity。

## 已冻结兼容裁决

1. root已将ParentDeletionPreviewSchema.counts写成显式字符串key的双参record，Turn.input/output加.optional()。这保留原Zod3的缺键、undefined/null及类型语义；不是新放宽。root在旧Zod3验证缺Turn键不会被补、null和0、任意合法表名counts保持。
2. 不改其余契约字段/协议/默认值。SessionShowEffect.data本已有optional，不重复修改。当前默认值为已合法的常量/placeholder，不借迁移重构。严格对象、strip/passthrough、nullable和可选字段、公私投影必须保持；真实0不得变null。
3. src/db/codec.ts两处旧z.ZodType<T,z.ZodTypeDef,unknown>改成Zod4公开泛型写法，保持输出T/输入unknown与真实safeParse。不得any绕过、删除校验或改错误表名/id。**encodeJson(undefined)仍存字符串"null"**，这是原数据库兼容行为；不要改编码/迁移/历史数据。
4. Zod4默认拒绝非有限number、不安全整数及更严格日期属于已知验证差异。用小合成案例明确记录对当前契约的影响；不把正常数据拒绝当可接受，不改schema去放宽旧脏值。遇到真实兼容问题先列具体文件/错误向root申请裁决，不能扩大scope自行改协议。
5. 旧测试/断言/超时/隔离保持。需要类型兼容调整先报具体路径与等价写法，初始不授权旧测试修改。禁止skip/only/删例/测试递归verify/audit。不改Prisma/C13 override/Node/npm，不顺手更新其他依赖。

## 精确scope

package.json、package-lock.json及reports/C14.md按总规则；另允许src/db/codec.ts、tests/integration/zod/、docs/DEPENDENCIES.md。src/contracts只读；不存在广泛src/或既有测试授权。可导入真实已合并模块做集成小测试，全部编造数据/临时SQLite；不读.env/private/真实数据库。

## 验收标准

1. 精确锁4.6.7、所有实际业务/契约导入用修补实现；npm ls --all无冲突，无易受影响Zod副本/兼容入口，官方registry有效在线audit完整报告，不把离线ci的0当证据。若出现新项先如实报告。
2. 新目录有针对性契约/实际codec回归：Turn缺键/undefined/null/对象、counts字符串键/0/非法负值、现用默认值、strict未知键拒绝与需保留扩展字段、nullable/真实零、错误数据ContractDataError和encodeJson(undefined)="null"。不重写生产逻辑自证。
3. 用很小的合成数组/Set等**实际受约束collection**与element spy证明超过上限时先拒绝、没有逐元素验证；不创建巨量输入、不压测内存、不制造OOM。对当前number/int/datetime代表性边界记录并测试，不宣称上游修补替代所有请求字节/深度限制。
4. 干净npm ci含Prisma generate、typecheck与focused后，预约独占完整verify C14（包含实际Next构建）。对账原62文件1027例加本包新增，原测试无缺失。会话、媒体、复述/作文、nightly、家长审计/事务与恢复回归完整执行；scope、contracts差异0，报告逐条准确。
5. root另克隆固定最终SHA，独立重装/读所有生产差异/在线audit/完整verify/必要自编探针，最终串行跑53项实际浏览器。作者本包无UI变更，不重复全浏览器，节省重型开销。问题原作者改，root不代写实现。

## 执行约束

遵守AGENTS；基于最新main创建task/C14，沿用现worktree即可，保持提交。安装/命令设置env -u RUST_LOG和已批准XDG_CACHE_HOME；网络只官方公开依赖元数据，HTTP10–15秒无无限重试；完整ci含脚本给180秒并保留进度，不把部分安装当完成。代理只在该命令清除，不能展示代理值/凭据。完整verify/实际build/browser全项目串行，启动前向root预约，root授权后运行。完成提交但不合并/推送/改状态；报告真实live仍延后与Zod行为差异。
