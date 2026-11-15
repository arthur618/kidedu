# 验收记录：C4B DeepSeek离线公开检索

- 验收人：总设计师（独立验收对话）
- 分支与提交：task/C4B @ 727a292
- 结论：通过（代码阶段；真实供应商联调延后）

## 独立检查

新建独立clone，固定最终SHA，独立npm ci；与最新main@c4f4e00试合，已包含。读取client.ts/cli.ts和内容扫描/导入生产实现，未把作者测试输出当作验收证据。

| 项目 | 结果 |
| --- | --- |
| 类型/测试/实际构建 | 56文件948测试通过；verify内真实Next生产构建通过 |
| 范围 | 10文件合规 |
| 契约 | 分支差异0 |
| 报告 | reports/C4B.md存在，区分假HTTP/模块隔离测试与真实DB/供应商未联调 |
| 自编探针 | 实际client/写文件实现：128/129补充平面Unicode边界、官方三个请求字段、字段投影/手算SHA256、无正文图标、并发同ID仅1成功、路径越界拒绝 |
| 浏览器 | 无UI改动；已有C8B主线33项已验，不为本包重复截图 |

## 标准核对与生产代码

1. 公开检索与LlmClient/孩子运行时隔离，没有导入DB/Agent或收集私人文件入口；请求只有query/count/need_content:false，固定官方HTTPS路径与redirect:error。默认无开关/key不发请求，输入schema严格拒绝childId等扩展参数。通过。
2. 单次最多1请求，8秒涵盖fetch及body，1MiB硬上限；取消实际abort/reader.cancel，迟到及越预算响应不变成成功。非2xx和坏输出是受限错误，不自动重发，不编造token/费用；合法空results仍成功。通过。
3. 官方字段投影复用research契约，日期+00:00合法，结果上限及坏/缺字段整体失败。sourceHash包含query/count/完整投影，不含时间；外部摘要只作为不可信文本保存，不抓取正文/图标/结果链接，不执行HTML或指令。通过。
4. CLI仅人工公开query/count/id；help零请求。固定research目录，逐层拒绝软链；临时文件O_EXCL/O_NOFOLLOW、sync后hard-link创建最终文件，只在不存在时成功，并发不覆盖。常规失败清理临时文件，SIGINT/SIGTERM取消；不可捕获终止可能留隐藏临时文件，报告诚实说明。通过。
5. 产物固定reference_only/public_reference，既有C4只扫描lessons/cards/passages，approve与DB内容schema拒绝research。测试中的DB入口用DAO mock/合成哨兵，不将其描述为真实数据库联调；生产路径直接审读确认没有业务DB写入，原C4 47项及完整948项回归通过。通过。

## 必须修改

无。

## 后续边界

- 公开词是否包含个人信息由操作人判断，不宣称自动PII识别；检索分数/authority不等于事实准确性或使用许可。仍需查证来源，既有check→review→人工approve→import保持。
- 未配置key/开启生产搜索，未请求真实DeepSeek，不含真实搜索结果或孩子数据；C4B-live质量/额度/实际收费仍待后续。
- 文件安全面向受控本地仓库，不承诺对已有本机文件系统攻击者提供隔离；不会覆盖已有最终文件。
