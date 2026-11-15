# 依赖维护与已知风险

本次C13保留Node22.1.0、Prisma6与现有SQLite契约，Zod仍为3.x。没有修改全局Node/npm、运行时Agent或生产协议。依赖版本符合engine声明不代表旧Node本身已完成安全维护审查。

## 固定维护线

| 依赖 | 当前目标 | 原因 |
| --- | --- | --- |
| prisma / @prisma/client | 6.19.3，两者对齐 | [官方6.x补丁](https://github.com/prisma/orm/releases/tag/6.19.3)把effect更新为3.21.0，修复[并发上下文漏洞](https://github.com/advisories/GHSA-38f7-945m-qr2g)，无需迁移Prisma7。 |
| @prisma/config中的deepmerge-ts | 仅`@prisma/config@6.19.3`下覆盖8.0.0 | 原精确依赖7.1.5命中[递归对象图栈耗尽漏洞](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)。不是全树强换。 |
| vitest | 4.1.12 | 本次[mocker redirect](https://github.com/advisories/GHSA-82fw-gwwq-j7x9)及[manual mock注入](https://github.com/advisories/GHSA-qxg6-89mg-rqv8)要求受维护的4.1.12线；3.2.6仅修较早UI问题，不是完整修复。 |
| vite | 版本裁决待最终在线审计 | 初始冻结6.4.4后发现[新query绕过告警](https://github.com/advisories/GHSA-8g5g-mxqh-grgj)，最低修6.4.5，6.4.6也声明兼容Node22.1。等待负责人精确版本裁决，不能为凑绿忽略。 |
| zod | 保持已锁3.25.76 | [已知高危](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)仅公布4.6.6及以后修复；当前3.x没有已发布安全补丁，单独设计迁移。 |

Vitest4[官方迁移说明](https://v4.vitest.dev/guide/migration)要求Node>=20/Vite>=6，并移除Tinypool。选择明确6.x Vite避免npm解析到要求Node22.12的7/8；没有启用Vitest UI、browser mode或新开发服务。原Playwright浏览器套件继续保留。

## 限定override的风险与证据

Prisma config6.19.3的官方依赖仍精确为deepmerge-ts7.1.5。8.0.0覆盖属于跨major例外，不能称为上游默认支持；[v8发布说明](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0)改变Map值深合并、部分类型名称及Into来源对象副作用。当前Prisma config实际动态导入`deepmerge`作为c12配置merger；项目主schema配置为普通对象，本任务不增加生产配置文件。

`tests/integration/dependencies/prisma-config.test.ts`从实际@prisma/config位置解析库副本，验证普通嵌套对象/数组、循环对象图5秒独立进程有界完成、Map值深合并、Into不改写独立来源对象，并经真实config loader与临时SQLite配置执行Prisma CLI validate。Into本来会修改其目标，目标与外部共享引用时仍可能共同变化；本测试不宣称v8实现所有引用无副作用。这里验证当前项目所用路径，不保证所有外部插件、任意Map配置或未来Prisma版本兼容。

当Prisma6官方config依赖采用修复版、或后续经设计迁移到其他受支持维护线后，应重新验证并撤除此限定override，不要把它复制到新Prisma版本。更新依赖时检查npm ls真实树，不能只改package字段。

## 审计规则与剩余欠账

在线audit使用官方registry，保留完整severity，不能用离线缓存返回0或降低筛选代替。初次目标安装后audit为2项（Vite moderate、Zod high），后续修补结果以C13报告最终记录为准；不得称全部漏洞已清。

Zod3即使有`.max()`仍可能继续解析每项，见[上游v3问题6653](https://github.com/colinhacks/zod/issues/6653)。只升级包为Zod4再改用`zod/v3`会保留受影响实现，不能作为修复。Zod4真正迁移涉及schema行为和类型，需负责人另冻结契约兼容目标；本包不动正在开发的C12契约。输入字节/结构前置限制是否足以缓解每条可达路径尚未完整评估，不把它当上游已修。

所有依赖回归使用编造数据/临时SQLite，未读取真实.env、private、密钥或真实孩子数据库。最终安装、在线审计、实际依赖树、完整收集与构建结果见reports/C13.md；真实模型质量与旧Node维护状态不在本次验证内。
