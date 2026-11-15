# C13 测试工具链与Prisma依赖安全维护

正式任务，2026-11-15。单Sol medium实现，root独立验收。不配置接口/密钥，不读.env/private，不派agent、不合并推送。C12正在独立分支；本包可先准备隔离补丁，但**C12合入后再合最新main并最终完整验证**，不改变C12现有契约目标。Zod迁移另包，不借本包改契约或产品语义。

## 已核实依据

基线docs/audits/npm-20261115.json为有效在线审计11节点（2 critical/6 high/3 moderate，不等于11条独立CVE）。只读预检已完成，root核实[Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)、[Prisma6.19.3](https://github.com/prisma/orm/releases/tag/6.19.3)、[deepmerge advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)、[v8 breaking changes](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0)、[Vitest4迁移指南](https://v4.vitest.dev/guide/migration)及官方registry确切版本元数据。

Vitest4.1.12 engine为^20/^22/>=24，依赖Vite^6/^7/^8；Vite6.4.6声明允许Node22.1，并用esbuild^0.25。固定选6.4.6，避免解析到要求22.12的7/8。Prisma config6.19.3用effect3.21.0但仍deepmerge7.1.5。不能照audit建议倒退Prisma6.12或直接force升级所有包；不能把包告警外推成已确认本项目可利用。

## 裁决

1. prisma与@prisma/client对齐固定6.19.3；保留Prisma6和现有SQLite schema/迁移，不改数据。使用官方effect修补，不自行替换ORM或上Prisma7。
2. 评估仅`@prisma/config@6.19.3`下`deepmerge-ts:8.0.0`的精确override，不全树盲替换。8.0含Map合并与Into行为变化，必须读取Prisma实际调用方式，验证当前项目纯对象配置/CLI路径兼容，并写明非上游默认依赖风险。测试解析实际Prisma config所用的库副本，普通嵌套对象、循环对象有界处理不栈溢出、Map/Into变化均准确记录。若不能安全证实，不强行装过关，报告root裁决；不隐藏/忽略该告警。
3. vitest固定4.1.12、显式开发依赖vite6.4.6；保留Playwright实际浏览器套件，不启用Vitest UI/browser/dev server或新报告平台。C12如已引入安全esbuild0.25.12，保留其测试内存打包用途与锁，不回退。实际解析树须无旧tinypool/vite-node/旧mocker/vite5/esbuild<=0.24.2副本；通过npm ls与在线audit核实，不仅改package字段。
4. 仅为Vitest2→4类型/constructor mock/隔离/计时器等真实兼容差异调整测试。**不删/skip/only测试，不减断言、不放松预算/幂等/事务/护栏/媒体隐私强度**；不以新版“绿灯”替代原测试实际收集。每个改动报告旧语义与等价新写法。类型失败先向root申请具体测试文件scope，再修改；初始不授权任何已有生产实现/测试全树。缺现有config时可仅必要新增vitest.config.ts维持完整收集/隔离，不无依据调大超时或排除难例。
5. Zod维持当前3.x；已知advisory修补在4.6.6及以后，尚无发布的安全3.x，单独设计迁移。不能改成zod/v3伪装审计清零、不能忽略advisory/降低audit severity筛选。本包报告剩余Zod风险，不能称全部漏洞已清。Node engine兼容不等于旧Node整体安全；本包不改全局Node/npm。
6. 全部使用编造数据/临时SQLite，generate/migrate/seed/import、会话/阅读/作文/nightly/parent/恢复与实际Next构建必须回归。依赖安全小型测试放新目录，只验证实际解析库/关键配置行为，不复制实现自证。禁止测试递归跑verify或audit；在线审计和完整自查由报告/root复跑证明。

## 精确scope

package.json/package-lock.json及reports/C13.md按总规则，另允许vitest.config.ts、tests/integration/dependencies/、docs/DEPENDENCIES.md。**已有测试文件尚未授权**，先集中列实际类型/语义差异向root申请路径；不改contracts/root scripts/业务实现/Prisma schema/迁移/看板/reviews。只读导入已合并真实模块测试允许。新漏洞或需要换版本先报告root，不自己扩大工具链/契约目标。

## 交付与验收

1. 精确锁/实际npm ls版本及engine无冲突，官方registry在线audit原工具链/effect/deepmerge链移除；剩余项逐条如实，不以离线0代替在线审计。失败保留报告不乱force。
2. 实际Prisma generate、迁移/种子/导入与限定config override兼容，schema/历史迁移零改动；不接触真实数据库。跨major风险与未来撤除override条件写明。
3. 原测试文件/断言完整执行，收集文件数与新增/变更逐条对账，所有取消/重启/幂等/租约/审计/隐私强度保持。新增小型真实依赖/config测试证明修复路径，不仅assert版本字符串。
4. C12合并后更新本分支至最新main，集中focused后预约独占verify C13（含实际build）。本包无产品UI，不要求作者重复全浏览器；root可组合必要回归，重型全项目串行。提交后scope/contracts0/report准确，工作树干净，不合并推送。
5. root新clone重装、在线audit、读锁与测试差异/自编探针、完整回归后给结论；问题原作者改，root不代写实现。Zod后续包必须由root先冻结兼容契约，当前不动。

## 版本补充裁决（2026-11-15）

初始候选6.4.4实际在线审计命中[GHSA-8g5g-mxqh-grgj](https://github.com/advisories/GHSA-8g5g-mxqh-grgj)，advisory最低修补6.4.5，root核实6.4.6官方release/registry engine仍支持Node22.1与esbuild^0.25.0，现精确目标更正为6.4.6，不再安装6.4.4。其他范围不变，继续实际在线audit，不据预检承诺清零。
