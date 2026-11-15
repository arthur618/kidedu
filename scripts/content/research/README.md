# 离线公开资料查证

在项目根运行 `npm run content:research -- --help` 查看中文说明。该命令只接受操作人明确输入的公开教材字词检索词；不得输入孩子姓名、会话编号、作业、作文、照片或录音，也不从文件或标准输入收集文本。操作人判断检索词是否适宜，本工具没有自动个人信息检测。

默认关闭，`.env.example` 的配置保持空白。负责人在本机环境设置 `DEEPSEEK_RESEARCH_ENABLED` 为精确 `true` 并配置非空 `DEEPSEEK_API_KEY` 后才可请求；请勿把密钥贴入聊天、内容文件或提交记录。不读取 `.env` 或私人目录。

示意命令（检索词为编造示例；启用后会产生一次计费请求）：

```
npm run content:research -- --query 编造公开词查证 --count 3 --id invented-example
```

固定使用[DeepSeek 独立网页搜索](https://api-docs.deepseek.com/zh-cn/api/search/)，仅发送query/count/need_content:false，最多5条。每次调用最多一个请求，失败也算一次，不自动重试。整体等待最多8秒，响应最多1MiB；取消会终止上游和读取，非合作迟到结果丢弃。供应商没有提供token或费用数据，本工具不编造费用；实际额度与收费请由负责人另行核对。

JSON仅存于 `content/research/`，状态始终为 `reference_only`，类型为 `public_reference`。不保存正文或图标，不访问结果链接，不执行摘要中的HTML或指令。摘要只是待核对的外部原文；排序分数与authority不能证明知识准确性或使用许可。需要人工核对来源、内容、授权；这些参考文件不能直接给孩子使用，不能代替现有check→review→sheet→人工approve→db:import流程，也不会被现有内容扫描器导入。

sourceHash对UTF-8编码的 `JSON.stringify({query,count,results})` 做SHA256；字段顺序固定为query、count、results；每项依次为title/url/snippet/summary/siteName/publishedAt/rank/authority。保留字符串和结果顺序，不裁剪、不Unicode归一化；不含时间或扩展字段。fetchedAt单独记录读取完成时间。

编号只允许1至80位ASCII字母、数字、下划线、短横线且首位为字母数字。拒绝路径穿越、目录祖先/目标符号链接和任何已有同名文件。先写随机临时文件并同步，再原子创建最终文件，并发同id只有一个成功；常规报错或SIGINT/SIGTERM不会留下半份最终JSON。不可捕获的系统终止可能留下隐藏临时文件，应人工确认没有命令运行后清理，已有最终文件仍不覆盖。

本任务只用编造数据和注入假HTTP测试，未发真实DeepSeek请求。真实密钥、额度、服务协议及接口联调留待C4B-live，不应把本地代码验证视作供应商验证通过。生产命令没有假模式或绕过启用条件的开关。
