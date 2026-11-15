> 后续root裁决：初始候选Vite6.4.4在实际安装审计中命中GHSA-8g5g-mxqh-grgj，正式任务已改为6.4.6（engine经registry核实）；下文是原只读预检历史，不是当前安装目标。

# C13 依赖安全修补只读预检

日期：2026-11-15。作者：Sol medium。仅事实研究，不是实现或验收通过结论。

结论：**目前没有同时保留Zod 3、Prisma 6、Node 22.1.0且通过已发布上游版本消除这11项告警的完整路径。主要阻塞是Zod 3没有已发布修补版。** Prisma可继续6.x，测试链可选择Vitest 4.1.12 + 明确固定Vite 6.4.4来保留当前Node；两者都需实施后的兼容验证，不能直接套用audit自动建议。Zod 4迁移应独立冻结，避开正在实施的C12契约。

## 基线与方法

- 有效在线输入：`work/dependency-audit-20261115.json`，auditReportVersion=2，11个包节点（2 critical / 6 high / 3 moderate）。这里不是11条独立CVE：例如Prisma/config是传递汇总，Vite含多条advisory。
- 当前锁读取自指定只读工作树，Zod 3.25.76、Prisma/client 6.19.0、Vitest 2.1.9；实际Node `v22.1.0`。未改包、锁、源、契约或分支；未运行安装、audit fix、构建、浏览器。仅写本报告。
- 在线元数据来自官方npm registry，明确`--registry=https://registry.npmjs.org --proxy= --https-proxy= --fetch-timeout=10000 --fetch-retries=0`，清除HTTP_PROXY/http_proxy、HTTPS_PROXY/https_proxy、ALL_PROXY/all_proxy、NO_PROXY/no_proxy，每个npm子进程25秒硬超时。所有查询成功，无无限重试；npm对空proxy标志有配置警告但返回码0，已通过环境清除代理。未读.env、private或真实密钥。
- GitHub Reviewed advisory、上游release和registry三者交叉核对；下表“候选”不是已安装/验收。离线安装报告0项不能替代该在线audit基线。

## 11个受影响节点与可选修补链

| 包节点 / 当前锁版本 | 直接/传递路径 | 本项目命中的受影响范围 | 上游修复 / 预检判断 |
| --- | --- | --- | --- |
| zod 3.25.76 | 直接生产依赖 | `<4.6.6` | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)列4.6.6修复；registry `zod@3`最高3.25.76。没有已发布Zod3安全版可直接升。 |
| prisma 6.19.0 | 直接dev依赖/CLI | audit汇总`6.13.0-dev.1 - 7.10.0 || 8.0.0-rc.3 - 8.1.0-dev.4` | 保留6可升6.19.3，修effect；但deepmerge链仍在，不能称全修。[官方6.19.3发布](https://github.com/prisma/orm/releases/tag/6.19.3)。 |
| @prisma/config 6.19.0 | prisma → @prisma/config | audit汇总`6.13.0-dev.1 - 7.10.0 || 8.1.0-dev.1 - 8.1.0-dev.4` | 6.19.3仍依赖deepmerge-ts **7.1.5**，effect改为**3.21.0**；仅升Prisma不消除此节点所有告警。[6.19.3 registry](https://registry.npmjs.org/@prisma%2fconfig/6.19.3)。 |
| deepmerge-ts 7.1.5 | prisma → @prisma/config → deepmerge-ts | `<8.0.0` | [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)修于8.0.0；这是跨major覆盖候选，不是Prisma6官方依赖范围内补丁。 |
| effect 3.18.4 | prisma → @prisma/config → effect | `<3.20.0` | [GHSA-38f7-945m-qr2g](https://github.com/advisories/GHSA-38f7-945m-qr2g)修于3.20.0；Prisma6.19.3官方采用3.21.0，优先其受维护补丁，不必转Prisma7。 |
| vitest 2.1.9 | 直接dev依赖 | UI漏洞`<3.2.6`；mocker漏洞见下；audit汇总`<=4.1.10` | [UI GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp)修3.2.6/4.1.0，但完整本次链候选至少4.1.12；不能停在3.2.6就称清零。 |
| @vitest/mocker 2.1.9 | vitest → mocker | `>=2.1.0 <4.1.11`及`>=2.1.0-beta.7 <4.1.12` | [redirect GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9)修4.1.11；[manual mock GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8)还需4.1.12。旧2/3 major无计划回补redirect修复（上游advisory明确）。 |
| tinypool 1.1.1 | vitest → tinypool | `<=2.1.0`及`<2.1.2` | [worker options GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3)修2.1.1；[run options GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr)还需2.1.2。Vitest2/3依赖`^1.x`，强塞2.x是跨major；Vitest4官方直接移除Tinypool，更合理的候选路径是4.x。 |
| vite 5.4.21 | vitest → vite；vite-node → vite；mocker链 | 本次advisory组合覆盖`<=6.4.3` | 在Node22.1约束下候选6.4.4；5.x不能靠现有小补丁清除本次范围。见下方逐项边界及[6.4.4发布](https://github.com/vitejs/vite/releases/tag/v6.4.4)。 |
| vite-node 2.1.9 | vitest → vite-node → vite | audit汇总`<=2.2.0-beta.2`（via vite） | Vitest3.2.6仍有vite-node3.2.4；Vitest4.1.12依赖表不再包含vite-node，此节点随链替换候选移除。[Vitest4.1.12 registry](https://registry.npmjs.org/vitest/4.1.12)。 |
| esbuild 0.21.5 | vitest/vite-node → vite → esbuild | `<=0.24.2` | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)修0.25.0；Vite6.4.4依赖`^0.25.0`。另有tsx嵌套esbuild0.28.2，不是本次受影响节点，别误降。 |

Vite本次多个advisory在6.x线的最低修复分别是：

| GitHub primary advisory | audit中本项目适用范围 | 6.x已修版 |
| --- | --- | --- |
| [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9) optimized deps .map路径 | `<=6.4.1` | 6.4.2 |
| [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) Windows UNC/NTLM | `<=6.4.2` | 6.4.3 |
| [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) Windows deny绕过 | `<=6.4.2` | 6.4.3 |
| [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv) Windows %转义 | `<=6.4.3` | 6.4.4 |
| [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw) editor参数误解 | `<=6.4.3` | 6.4.4 |
| [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm) Windows存在性检查绕过 | `<=6.4.3` | 6.4.4 |
| [GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw) custom middleware跨源脚本 | `<=6.4.3` | 6.4.4 |
| [GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22) 非Windows文件越界 | `<=6.4.3` | 6.4.4 |

这些有各自开发服务暴露、Windows、特定中间件等利用前提，不能仅凭安装告警声称项目生产接口已可被利用；同样不能因本机macOS/常跑vitest run就删除告警。Tinypool两项是原型污染gadget，需要上游污染等条件；deepmerge需要递归对象图，纯JSON不能直接构造自引用；Effect描述的是并发fiber/ALS/RPC上下文。此处未做可达性/利用验证。

## Node 22.1.0与候选版本：官方声明，不等于实际运行通过

| 候选 | registry engines / 上游要求 | 当前Node22.1.0 |
| --- | --- | --- |
| prisma、@prisma/client 6.19.3 | `node >=18.18`；Prisma peer TypeScript>=5.1.0 | 声明允许，client/CLI应同版；当前TS5.9.3满足peer |
| deepmerge-ts 8.0.0 | `node >=16.0.0` | 声明允许；跨major行为兼容未验 |
| effect 3.20.0/Prisma采用3.21.0 | 本次effect3.20 registry未声明engines | 不能由“无engines”证明兼容；由Prisma6.19.3声明与后续真实回归验证 |
| tinypool 2.1.2 | `^20.0.0 || >=22.0.0` | 声明允许，但不建议跨major塞入旧Vitest |
| Vitest 3.2.6 | `^18.0.0 || ^20.0.0 || >=22.0.0`；仍mocker3.2.6/tinypool^1.1.1 | Node允许但安全不完整 |
| Vitest 4.1.12 | `^20.0.0 || ^22.0.0 || >=24.0.0`；Vite依赖/peer为`^6 || ^7 || ^8` | 本包声明允许；需明确选择Vite6以免解析到不兼容版本 |
| Vite 6.4.4 | `^18.0.0 || ^20.0.0 || >=22.0.0`；esbuild^0.25.0 | 声明允许，可与Vitest4.1.12组合 |
| Vite7最新7.3.8 / Vite8最新8.3.8 | `^20.19.0 || >=22.12.0` | **不允许**；不能裸升最新Vite |
| Vitest5 | [当前官方迁移指南](https://vitest.dev/guide/migration/)要求Node>=22.12.0及Vite>=6.4.0 | **不允许**；不是本约束的候选 |
| Zod3.25.76 / Zod4.6.6 | registry无engines字段 | 不能以engine字段判断安全性；Zod4是API/语义迁移，与Node升级是两件事 |

版本元数据primary直链：[Prisma6.19.3](https://registry.npmjs.org/prisma/6.19.3)、[client6.19.3](https://registry.npmjs.org/@prisma%2fclient/6.19.3)、[config6.19.3](https://registry.npmjs.org/@prisma%2fconfig/6.19.3)、[deepmerge8.0.0](https://registry.npmjs.org/deepmerge-ts/8.0.0)、[effect3.20.0](https://registry.npmjs.org/effect/3.20.0)、[tinypool2.1.2](https://registry.npmjs.org/tinypool/2.1.2)、[Vitest3.2.6](https://registry.npmjs.org/vitest/3.2.6)、[Vitest4.1.12](https://registry.npmjs.org/vitest/4.1.12)、[mocker4.1.12](https://registry.npmjs.org/@vitest%2fmocker/4.1.12)、[Vite6.4.4](https://registry.npmjs.org/vite/6.4.4)、[Vite7.3.8](https://registry.npmjs.org/vite/7.3.8)、[Vite8.3.8](https://registry.npmjs.org/vite/8.3.8)、[Zod3.25.76](https://registry.npmjs.org/zod/3.25.76)、[Zod4.6.6](https://registry.npmjs.org/zod/4.6.6)。

## 可分批冻结的方案

### A. Prisma6受维护补丁，范围可独立于C12契约

候选把prisma和@prisma/client对齐6.19.3，重新生成客户端但不改schema/迁移。官方release明确这是修effect的6.x补丁；6.19.1/6.19.2的config仍effect3.18.4，因此本次作用点至少6.19.3。

deepmerge仍7.1.5，所以有两个诚实选项：先交effect修复并保留deepmerge欠账；或root另冻结**仅@prisma/config下deepmerge-ts→8.0.0**的限定override试验，验证后再判接受。不能把override称作“没有跨major风险”的普通补丁。[8.0.0官方release](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0)改变Map值深合并、元数据类型及deepmergeInto的副作用；本地只读确认Prisma config动态导入deepmerge给c12 merger，尚未检验Map/嵌套配置行为。npm审计建议降6.12.0会绕开旧config依赖，但它不是向前修补，可能失去后续安全/功能修复，不作为默认方案。

实施验收应有：受限安装后的在线audit、npm ls解析链、同版Prisma generate、临时SQLite migrate/seed/import与nightly/parent回归、独占完整verify和真实build；需要config merge的合成循环对象/Map回归才能评估override。这里都未运行。

### B. 测试工具链单独major迁移，不改产品契约

候选Vitest **4.1.12** + 明确固定Vite **6.4.4**。这是在所查primary版本中能处理本次mocker链且保持当前Node的最小稳定major组合，不是已验证的lock方案。官方[Vitest4迁移文档](https://v4.vitest.dev/guide/migration)说明4.x去掉Tinypool，pool配置发生变化；2→4跨两个major，mock/spy、计时器、模块隔离、子进程和数据库测试均应检查，不可仅看npm install成功。

不能只装Vitest3.2.6（仍留mocker及tinypool问题），也不能只覆盖旧Vitest的mocker到4.x（内部同版包API未经支持），或只把tinypool1强换2而宣称全修。无需为此引入Vitest browser mode；本项目UI验收是已有Playwright测试。Node22.1不是要求盲升Vitest4的理由：选4是本次mocker修补维护线与去Tinypool的结果；若root改用其他测试runner，那是另一个范围更大的替换方案。

实施后必须核对实际lock中无旧tinypool/vite-node/旧mocker或旧esbuild副本，npm engine无不匹配，保留原有断言与并发/隔离强度，完成focused到全套verify/真实build。不要以升级工具为由改弱已有租约、取消、幂等或安全测试。

### C. Zod独立设计裁决：不在C12并行改契约

[官方issue6653](https://github.com/colinhacks/zod/issues/6653)仍Open，指出v3即使.max()先查尺寸仍继续逐元素解析；[已合并修复PR6652](https://github.com/colinhacks/zod/pull/6652)及[4.6.6 release](https://github.com/colinhacks/zod/releases/tag/v4.6.6)明确改v4集合上限提前返回。只改package版本成Zod4而把导入换成`zod/v3`，可能让audit数字消失却继续执行受影响v3实现，不能当安全修复。

在坚持保留Zod3时，只能诚实保留此项上游未修风险，或由root另冻结、评审并测试特定入站字节/结构预检或维护v3补丁；不能把普通.max()本身当作该CVE的有效前置拦截。此类缓解不等于上游修补、不能许诺audit清零。本次未评估全部HTTP/CLI/供应商输入边界是否已有等价限制。

如果要求全部已知告警用上游修补版本清除，Zod4.6.6或更高修补版需要单独迁移任务；root先定公共DTO不变与schema行为差异，再允许修改contracts。参考[Zod官方迁移指南](https://zod.dev/v4/changelog)：ZodType泛型、默认值、对象/record和错误行为等有变化，必须逐契约验证。应等待C12完成/冻结后做这一步，不能在其并行工作树擅改共享契约。

## 未验证与root独立复核清单

1. 未安装候选版本，未生成新lock，未跑新在线audit；不能保证修后恰好只剩Zod一项，也未排查本次输入以外新披露漏洞或新传递依赖。
2. Node兼容结论仅来自明确版本engines/官方要求；完整传递树、实际运行行为和Node22.1自身安全维护状态未验证。“符合engine”不等于该旧Node版本整体安全。
3. deepmerge8覆盖Prisma6的行为兼容及c12 merger路径未验；保持Prisma6只升级官方6.19.3可以确定修effect，但不能据此宣称deepmerge已修。
4. Zod3安全补丁缺失是本次重要阻塞；issue状态/registry最高3.x是本次查询时点事实，冻结任务前root应再次确认。
5. 未验证开发服务攻击可达性、未跑恶意PoC，不把包告警外推成已确认生产可利用。未配置真实key、未读private/.env、未改C12或任何实现。
6. 报告是候选事实预检；正式任务scope、补丁选择及最终验收仍由root独立核实冻结。
