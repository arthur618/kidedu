# C7 运行时接口

服务启动时 `createServerDeps()` 校验 DeepSeek 路由并创建一次真实 LlmClient，连接真实编排器、数据层、Agent 与护栏。C9已接通阅读/文字复述；作文由C10继续接入。没有生产假模型开关。

全部 POST 要求 `Idempotency-Key`（16–128 位字母、数字、下划线或连字符），controller 一次操作的重试保留同一标识，下一操作换标识。响应复用 `src/contracts/session.ts` 的 `SessionPacketSchema`，只向界面发执行完成的 `show`；缺内容或重启缺原图用 `unavailable` 和正常退出入口。

| 方法/地址 | 正文 | 返回 |
| --- | --- | --- |
| POST `/api/session` | `{childId,lessonId,hasEssayToday}` | `{sessionId,state:"homework_capture",effects:[{type:"show",screen:"homework_capture"}]}` |
| POST `/api/session/[id]/homework` | `{imageDataUrl?,spokenText?}`，至少一个 | 看清后 `homework_confirm` + `{items}`；不确定仍 `homework_capture` + `notice` |
| POST `/api/session/[id]/event` | 契约 SessionEvent | 完整 Packet；非法状态事件仍显示当前快照 |
| POST `/api/session/[id]/coach` | `{char,text}` | 当前字的讲解/下一步实际提示，或下一学习状态 |
| POST `/api/session/[id]/reading` | `{text}` | 复述后最多一次追问，再收尾；同样要求稳定操作ID |
| GET `/api/session/[id]/reading/card?char=字` | 无 | 仅当前选文内的approved只读字卡；不推进学习 |
| GET `/api/session/[id]` | 无 | 当前 Packet，兼容保留 `context`、`homework`；不跑模型、不推进步骤 |

400 表示格式/图片/操作标识不合要求；404 表示孩子、课或会话不存在；409 表示标识复用但正文不同，或当前不接受该教练活动。业务拒绝有持久终态，不阻塞退出。

## 事务和恢复

同一 Node 进程按 childId（start）或 sessionId（其他命令）排队。`SessionCommand` 持久保存 SHA-256 指纹、去图待处理效果、检查点及响应；`CoachRuntime` 和 SessionContext 分离。新会话创建/start/命令检查点同一短事务。学习事件的 ChildChar、Session、SessionRuntime 和命令 transitioned 检查点同一短事务。事务提交后才运行 Agent/护栏。

教练步骤/历史与命令 complete 同一事务；活动完成时学习转换和命令 transitioned 同一事务。响应丢失或进程重启重放不会重复 reduce、累计学习结果或数孩子发言。外部模型在进程崩溃后可能再调用一次；这不是模型侧恰好一次承诺。本轮未实现多实例分布式锁。

理解按 explain→make_word→make_sentence。仅首次空白表示“我听完了”，不算六句；后续空白不跳步。六句仍未完成记一次 wrong，新一轮活动重置。缺 approved 卡不调用教练、不造卡、不记孩子错。

## 图片与预算

只接收 JPEG/PNG data URL，解码最多2MB；不落盘。原图仅在当前进程内的当前对照显示持有，离开对照即释放。所有持久记录和响应缓存去图，指纹只存哈希。重启 GET 用 photo_not_available；原照片命令同正文重放重新提供图片并可恢复外部效果。新 ID 的非法重拍不能替换旧图或冒充旧命令。当前图按原命令scope/key绑定，GET读取该命令的可用快照；较新无图命令的历史结果不能遮蔽它。旧命令重放返回其当时的合法结果，与GET的当前快照分开；当前已退出对照时不再执行旧视觉效果。

服务端外部效果总预算100秒，浏览器120秒；可注入时钟和定时器。真实 fetch 合并操作取消信号；只有纯模型结果参与竞速，迟到结果没有数据库写入或状态推进权限。按调用上下文匹配 D2 onTurn 及输入输出；Turn 写入在 Agent 返回后明确 await，失败会使接口报错并保留可恢复检查点，不能被模型客户端吞掉。整体取消时按可注入时钟记录本次call开始至取消的已知耗时，未知token仍可为0；不等待迟到计量，也不补写迟到Turn。视觉调用 verdict=skipped，护栏候选分别记 blocked/pass。

## 验证

`tests/integration/` 用 Prisma migrate deploy 创建临时 SQLite，连接真实 handler、编排器、数据访问、Agent 和护栏，只有 LlmClient 假。`src/ui/integration.browser.ts` 通过独立回环 HTTP server 执行生产 handler；浏览器只重定向地址，不编响应。用 `C7_BROWSER_PORT` 指定空闲端口，缓存继承 XDG_CACHE_HOME 或使用系统临时目录。

## C9阅读边界

approved内容稳定选文，公共正文只投影id/title/body/targetChars，keyPoints仅在私有ReadingRuntime快照。首问取审核question并规则审查；两条孩子原话/一次follow_up/收尾用真实Reader和护栏，模型事务外，活动/转换/命令原子。阅读Turn只存白名单计量元数据。GET重查approved且只读当前活动，撤审后正常unavailable。C12已将整页重载接到同一会话的可信恢复入口；旧GET兼容含context/homework，浏览器恢复不使用该旧投影。真实外部配置/联调仍延后。


## C12页面刷新恢复

新POST `/api/session/[id]/resume`只接受契约2.10的`{childId,lessonId,operationId?}`，不接收孩子输入、任意事件或媒体，无需另建操作ID。SessionOrigin在真实start和其命令检查点的同一短事务建立；旧会话不猜课次，不从浏览器回填归属。恢复核对Session、runtime.context和Origin，错配/无可信来源统一404。此端点响应是经过RecoveryResponse/SessionPacket parse的公共值，不带ctx或私有命令载荷；不改变旧GET。

无operationId或已complete/rejected只读当前权威快照，零模型、零业务写入。未知/其他会话操作返回operation_missing和当前快照，不建空回答。真正未完成操作按原sequence先恢复较早检查点，只读服务端持久原载荷/私有Essay action；学习reduce、流水、原话卡/正文沿用原原子边界。已wrap_up/ended不复活旧动作，执行待办仍遵守原startedAt/limitMinutes及100秒模型预算，缺图正常退路，不向模型发送占位符。模型调用成功但最终存库前崩溃仍可能再次调用和计费，不承诺模型恰好一次。

浏览器仅在sessionStorage按child+lesson保存严格SessionRecoveryHint（序列化UTF16长度最多8192），网络前写稳定标识，合法响应后清pending；不保存Packet、ctx、正文、草稿、录音、图片、base64或BlobURL，不使用localStorage/IndexedDB。开始响应丢失后沿用原startRequestId及原IDs/hasEssayToday。存储禁用/损坏/容量不足退为本次内存流程；无法写入时不能承诺下一次刷新恢复。未知操作清pending并说明重新填写，404提供明确重新开始入口；ended不自动建新会话，只有孩子点击重新开始才新建start ID。

切孩子/课次更换controller/service与媒体子树，旧网络abort/迟到结果隔离。StrictMode同步清理重挂复用同一启动操作；真正卸载取消请求。busy期间quit仍由controller排队。**未发送文字、长作文草稿及未确认录音仅在内存，整页刷新会丢失，不属于恢复范围。**SessionOrigin纳入家长19类可信只读预览，仍executable=false，无删除。

## C8C TTS流式WAV兼容

仅DeepSeek TTS响应经原有有界读取到正常EOF后，兼容固定44字节PCM16单声道头中RIFF/data长度同时为`0xFFFFFFFF`的已观察变体：复制字节，按实际长度填写两字段，再用原严格WAV检查核验格式、帧、采样率、大小及30秒时长。规范长度WAV继续支持；混合sentinel、扩展chunk、错误头、声明Content-Length不符、流错误/取消/超时仍拒绝。ASR上传与默认`inspectPcmWav`仍拒绝未知长度头；2MiB、8秒服务预算、并发2及12秒客户端预算均未改变。

正常EOF且没有声明总长度，无法凭此检测恰好整帧提前结束的语义截断；规范化不证明整段朗读语义完整。作者测试只使用内存合成PCM与假fetch，不代表真实供应商回测或音质验收。
