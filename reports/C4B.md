# 任务报告：C4B DeepSeek离线公开资料检索

- 实现者：Codex / Sol medium
- 分支：task/C4B，已合main@715bead
- 自查结果：focused 108测试通过（61新增及47既有C4回归），typecheck通过；完整verify与真实构建待独占窗口。

## 做了什么

新增可注入fetch/getEnv/clock的独立公开检索客户端，以及content:research命令。客户端只请求固定DeepSeek搜索接口，默认关闭、无key零请求，每次最多一次请求；8秒包含响应读取，最多1MiB，支持真实abort与非合作迟到结果丢弃。官方结果只投影有限参考字段，产物固定public_reference/reference_only，隔离于内容审批与孩子路径。CLI用临时文件同步后硬链接原子创建，不覆盖已有文件，拒绝路径穿越与目录祖先软链；无.env/private读取和真实供应商请求。

## 验收标准对照

| 验收标准 | 测试 | 状态 |
| --- | --- | --- |
| 实际发送的固定路径/Bearer/JSON字段、默认关闭和无key零网络；非法输入零网络，Unicode补充平面128/129边界、count边界均回归。 | scripts/content/research/client.test.ts：只发固定POST/Bearer/三个字段；默认关闭及缺key不请求；非法输入零网络；128补充平面字符与count边界。 | focused通过 |
| 官方字段映射/带时区日期、空成功、坏/超长/缺字段、超结果、危险链接、供应商错误正文、HTTP400/401/429/5xx、慢body/过大/取消/非合作迟到/重定向全部有界，最多一次请求，用量元数据真实。 | client.test.ts：官方投影、空结果/hash、坏结果整体失败、缺少官方字段、UTF8/无body、HTTP各状态、坏JSON/超大响应、整体8秒、调用方取消、非合作fetch/reader迟到、过预算回调尚未执行、供应商抛错/重定向。 | focused通过 |
| 合成canary证明key/原错误不进console/产物；外部HTML/指令不执行、不拉结果链接，正文和图标不保存。原Child/Session/Turn/审批数据不变。 | client.test.ts固定请求次数与精确投影；cli.test.ts：合成HTTP经真实CLI进程写入、失败不写产物/原错误和key不进console；tests/integration/research/isolation.test.ts：审批及导入隔离。集成使用合成文件哨兵及mock DB upsert，不连接真实孩子数据库；生产代码只导入契约，无运行时DB/Agent模块。 | focused通过（合成隔离证明，非真实DB联调） |
| CLI真实执行help及合成结果写入，路径穿越/软链/已有文件/并发同id/中断不损坏；失败不产物。research结构不能作为approved内容入库，既有C4自查/审校/批准回归不过度放宽。 | cli.test.ts：真实help、合成HTTP真实进程、拒绝覆盖/目标软链/目录、拒绝research与祖先软链、并发同id/中断、真实SIGTERM慢body取消；isolation.test.ts验证check/review/sheet不扫描、approve拒绝、DB导入忽略research且误放cards拒绝。既有pipeline.test.ts 25测试及checks.test.ts 22测试通过。 | focused通过 |
| 集中focused后预约独占窗口跑一次verify C4B（包含实际构建），提交后scope/契约差异0/report准确。root新clone复跑、读生产代码/补充探针，问题交原作者返工；真实DeepSeek请求仍留C4B-live，不能把假HTTP写成供应商验证通过。 | main合并后typecheck及focused108通过；node scripts/check-scope.mjs C4B通过（10文件）；git diff main...HEAD -- src/contracts为空。verify及实际build待窗口；root独立验收待交付。 | 最终验证待窗口 |

## 改动的文件

- scripts/content/research/client.ts、client.test.ts：固定搜索协议、响应投影、总预算及单请求元数据、合成HTTP测试。
- scripts/content/research/cli.ts、cli.test.ts：参数、中文输出、安全写盘、真实进程测试。
- scripts/content/research/README.md、content/research/README.md：公开资料边界、hash规范、操作与真实联调待办。
- tests/integration/research/isolation.test.ts：原审批与入库路径隔离回归。
- package.json：增加独立content:research脚本，无依赖变更。
- .env.example：仅新增空DEEPSEEK_RESEARCH_ENABLED；合主干时保留主干所有空配置。
- reports/C4B.md：本报告。

## 新增依赖

无。

## 契约问题

无。未修改src/contracts、现有pipeline、reviews或看板；主干合并带来的其他任务内容不属于本包diff。

## 没做的和已知问题

真实DeepSeek联调、真实密钥、额度及计费验证未做，留C4B-live。所有网络结果都是编造数据与假fetch，实际CLI进程验证也通过测试注入，生产无假模式开关。操作人须判断检索词是否适宜；没有自动PII检测。来源准确性和许可仍待人工核对，authority和排序不替代审核。

不可捕获的系统终止可能留隐藏临时文件，不会留半份最终JSON；README说明需先确认无命令运行再人工清理。无UI变更，按负责人安排不单独跑浏览器。

## 建议

由负责人在C4B-live核对实际额度、收费与接口响应，勿把key贴聊天。
