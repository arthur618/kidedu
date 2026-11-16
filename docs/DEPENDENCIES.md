# 依赖维护与已知风险

C13保留Node22.1.0、Prisma6与现有SQLite契约；C14在负责人冻结契约2.11后将实际Zod运行时迁移到4.6.7。没有修改全局Node/npm、运行时Agent或生产协议。依赖版本符合engine声明不代表旧Node本身已完成安全维护审查。

## 固定维护线

| 依赖 | 当前目标 | 原因 |
| --- | --- | --- |
| prisma / @prisma/client | 6.19.3，两者对齐 | [官方6.x补丁](https://github.com/prisma/orm/releases/tag/6.19.3)把effect更新为3.21.0，修复[并发上下文漏洞](https://github.com/advisories/GHSA-38f7-945m-qr2g)，无需迁移Prisma7。 |
| @prisma/config中的deepmerge-ts | 仅`@prisma/config@6.19.3`下覆盖8.0.0 | 原精确依赖7.1.5命中[递归对象图栈耗尽漏洞](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)。不是全树强换。 |
| vitest | 4.1.12 | 本次[mocker redirect](https://github.com/advisories/GHSA-82fw-gwwq-j7x9)及[manual mock注入](https://github.com/advisories/GHSA-qxg6-89mg-rqv8)要求受维护的4.1.12线；3.2.6仅修较早UI问题，不是完整修复。 |
| vite | 6.4.6 | 初始6.4.4安装后在线审计发现[query绕过告警](https://github.com/advisories/GHSA-8g5g-mxqh-grgj)，root核实后正式更新为6.4.6；最低修复6.4.5，6.4.6声明兼容Node22.1。 |
| zod | 4.6.7 | [集合资源耗尽漏洞](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)修于4.6.6及以后；使用真正修补运行时，不走v3兼容入口。 |

Vitest4[官方迁移说明](https://v4.vitest.dev/guide/migration)要求Node>=20/Vite>=6，并移除Tinypool。选择明确6.x Vite避免npm解析到要求Node22.12的7/8；没有启用Vitest UI、browser mode或新开发服务。原Playwright浏览器套件继续保留。

## 限定override的风险与证据

Prisma config6.19.3的官方依赖仍精确为deepmerge-ts7.1.5。8.0.0覆盖属于跨major例外，不能称为上游默认支持；[v8发布说明](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0)改变Map值深合并、部分类型名称及Into来源对象副作用。当前Prisma config实际动态导入`deepmerge`作为c12配置merger；项目主schema配置为普通对象，本任务不增加生产配置文件。

`tests/integration/dependencies/prisma-config.test.ts`从实际@prisma/config位置解析库副本，验证普通嵌套对象/数组、循环对象图5秒独立进程有界完成、Map值深合并、Into不改写独立来源对象，并经真实config loader与临时SQLite配置执行Prisma CLI validate。Into本来会修改其目标，目标与外部共享引用时仍可能共同变化；本测试不宣称v8实现所有引用无副作用。这里验证当前项目所用路径，不保证所有外部插件、任意Map配置或未来Prisma版本兼容。

当Prisma6官方config依赖采用修复版、或后续经设计迁移到其他受支持维护线后，应重新验证并撤除此限定override，不要把它复制到新Prisma版本。更新依赖时检查npm ls真实树，不能只改package字段。

## Zod4兼容边界与审计

C13初始6.4.4目标安装后audit为2项（Vite moderate、Zod high）；经正式裁决Vite6.4.6后仅剩Zod high。C14固定Zod4.6.7并实际运行修补实现后，官方registry完整在线audit为0项，npm ls --all退出0，锁中仅一份Zod4.6.7。这里只描述该日期、该锁文件的审计结果，不代表未来没有新漏洞。不能用离线缓存0或降低severity替代有效在线审计。

真正使用Zod4，而非包升级后继续走`zod/v3`；[上游v3问题6653](https://github.com/colinhacks/zod/issues/6653)说明仅.max()而继续逐项解析不能消除该漏洞。[4.6.7发布](https://github.com/colinhacks/zod/releases/tag/v4.6.7)及[迁移指南](https://zod.dev/v4/changelog)提供版本与行为依据。业务/契约仍从`zod`顶层导入，代码扫描无兼容入口或旧ZodTypeDef。

负责人先冻结契约2.11：parent counts显式字符串key双参record，Turn.input/output显式optional以保持原缺键语义。C14不改契约，只把codec两处公开泛型改为`z.ZodType<T, unknown>`；safeParse与错误表名/主键/编码保持。Turn缺键在schema解析时仍缺键，显式undefined仍保留键；持久化沿用encodeJson(undefined)为字符串"null"，从SQLite读回null。这不是新数据迁移或协议变化。

新增`tests/integration/zod/`验证全部现用默认常量、strict拒绝未知键、默认strip投影、内容审校元数据保留路径、nullable与真实0、ContractDataError、真实临时SQLite Turn往返。针对数组/Set/Map只用3个合成元素和max(2)，通过element/key/value spy证明超限时先拒绝、没有逐元素校验，并用合法输入证明spy确实工作；不制造巨量数组或OOM。

已知验证边界：Zod4的number拒绝Infinity/-Infinity/NaN，int拒绝不安全整数。当前DictationMark.box各值必须有限；Turn.inputTokens接受MAX_SAFE_INTEGER但拒绝其+1。正常有限0保持，真实0评分与unavailable/null继续不同。IsoDateTime仍需带秒的UTC格式，接受合法闰日，拒绝非法闰日、无秒或offset字符串；参考资料publishedAt显式offset:true仍接受+00:00及null。未通过修改schema放宽这些不正常数据。

上游集合修补不替代所有请求字节、深度或递归输入限制；本包没有完整评估所有入站边界，也没有改变原护栏、预算、会话或媒体协议。所有回归使用编造数据/临时SQLite，未读取真实.env、private、密钥或真实孩子数据库。最终安装/在线审计/收集与构建记录见reports/C14.md；C13的限定deepmerge跨major风险和撤除条件仍适用。旧Node安全维护及真实模型质量仍不在本次验证内。
