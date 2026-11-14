# C4B DeepSeek离线公开资料检索

正式任务，2026-11-14；契约2.9与精确scope冻结后派发。单Sol medium实现，root独立验收；不派agent、不改契约、不合并推送。负责人已授权DeepSeek可行能力集成、真实key及接口测试延后。只做本包，不改已批准内容和既有审批语义。

官方：[独立网页搜索](https://api-docs.deepseek.com/zh-cn/api/search/)。不用Chat自主联网工具；不新增运行时Agent，不给孩子自由搜索。

## 目标与边界

1. 新建独立离线content:research命令与可注入fetch/getEnv/clock的PublicResearchClient，遵守src/contracts/research.ts。只接受人工明确输入的公开教材字词查证词和count，不能接child/session ID、数据库、照片、录音、作业或作文原文。检索词是否适宜由操作人负责，不能宣称自动PII检测。实现不得导入运行时DB/Agent/家长模块；不读data/private或真实.env。
2. 固定POST https://api.deepseek.com/v1/tools/search，服务端Bearer。DEEPSEEK_RESEARCH_ENABLED精确true且DEEPSEEK_API_KEY非空才可联网，.env.example只留空；默认关闭/无key零请求。请求体仅query/count/need_content:false，不传ori_question、localization、tools或用户地址。共享schema按Unicode码点限制query，count最多5。
3. 每次search最多一次供应商请求，不自动收费重试；整体8秒（包括body读取）、调用方取消、1MiB响应上限，真实abort上游/reader，非合作迟到结果丢弃。固定redirect:error，不能把Bearer转发到重定向地址。不输出key或供应商原始错误/响应，错误使用契约受限枚举。requestCount是已发请求次数，失败也计1，latency实测；供应商无token/cost，不编造费用。空results是成功，与故障不同。
4. 解析官方results，逐项提取title/url/snippet/summary/site_name/date/rerank_score/authority，映射契约字段并校验；忽略content/site_icon和扩展字段，不保存/拉取完整正文或图标，不访问结果URL。坏字段/超条数/危险URL或坏JSON整体失败，不静默变成空成功。RFC3339的+00:00日期合法。sourceHash对query/count与完整投影results做确定性SHA256，不包含时间；本任务README说明规范化方式。
5. 产物只能是status=reference_only、kind=public_reference的独立JSON，位于content/research/，不生成Lesson/CharCard/Passage或approved状态，不自动把搜索排名/authority当事实准确性/许可。外部摘要含HTML/指令仍是待人工查证原文，不能执行或当系统提示；无UI/Markdown渲染。既有C4 check→review→sheet→人工approve→db:import完整保留，research不被扫描/导入。
6. CLI参数--query/--count/--id（安全ASCII文件名，长度上限合理）；--help中文且零网络，不从文件/标准输入自动收集私人文本。只在已验证结果后写新JSON；固定research目录，拒绝路径穿越/符号链接（含目录祖先）和覆盖已有任何文件，原子创建，失败不留半文件。多个命令同id不能互相覆盖。CLI从项目根执行，错误只正常中文摘要，不回显密钥/原错误。成功列参考文件位置/条数，请人工核对；不自动运行后续审批。
7. 文档说明仅公开资料、服务默认关闭、真实联调未做、待核对来源/授权、额度与一次请求边界；留配置空位，不让用户把key贴聊天。示例全部编造/离线假fetch，不提交抓取到的受版权正文或真实搜索记录。需要fake CLI演示可仅测试注入，不设生产绕过开关。

## 精确scope

scripts/content/research/、content/research/、tests/integration/research/、.env.example；package.json/package-lock.json及reports/C4B.md按总规则。README放新目录内，不修改既有content命令/DB实现。contracts/reviews/看板只读。允许导入既有真实模块做回归，但不修改其内部。若scope遗漏先报告root。

## 验收

1. 实际发送的固定路径/Bearer/JSON字段、默认关闭和无key零网络；非法输入零网络，Unicode补充平面128/129边界、count边界均回归。
2. 官方字段映射/带时区日期、空成功、坏/超长/缺字段、超结果、危险链接、供应商错误正文、HTTP400/401/429/5xx、慢body/过大/取消/非合作迟到/重定向全部有界，最多一次请求，用量元数据真实。
3. 合成canary证明key/原错误不进console/产物；外部HTML/指令不执行、不拉结果链接，正文和图标不保存。原Child/Session/Turn/审批数据不变。
4. CLI真实执行help及合成结果写入，路径穿越/软链/已有文件/并发同id/中断不损坏；失败不产物。research结构不能作为approved内容入库，既有C4自查/审校/批准回归不过度放宽。
5. 集中focused后预约独占窗口跑一次verify C4B（包含实际构建），提交后scope/契约差异0/report准确。root新clone复跑、读生产代码/补充探针，问题交原作者返工；真实DeepSeek请求仍留C4B-live，不能把假HTTP写成供应商验证通过。
