# C7 实施补充：契约、幂等与恢复（总设计师裁决）

2026-11-13。原 C7 的 1–17 条继续适用；下文解决 preflight 清单，并对明确列出的旧描述作补充。实现者不改契约。

## 共享响应与界面

- 契约 2.2 新增 `src/contracts/session.ts`，原三个契约文件保持原义。`SessionPacketSchema` 是 HTTP 交付结构；内部编排器 `Effect` 仍不变。对外只返回执行完成后填好数据的 show；非 ended 状态应有匹配 show，或明确 unavailable；ended 可为空 effects。
- C7 两端直接复用共享 schema/type，删除 UI 本地重复数据 schema。`notice` 是正常提示；`unavailable` 渲染为正常中文与“今天先到这”出口。缺字卡不能造 approved 内容，不能把系统没准备好计作孩子答错。缺报词所需卡也使用此安全呈现。
- GET 返回当前显示快照，不能为刷新再跑模型或推进教练步骤。无效事件仍不推进状态，但 HTTP 可以组装当前快照，不能因 effects 为空就让 UI 卡死。
- 理解三步仍 explain→make_word→make_sentence。空 text 只作为 explain→make_word 的首次“我听完了”，不算六句孩子回答；后续空白不能反复跳步。完成一步后返回下一步实际提示，不能把上一问题带到新步骤。
- 所有调用 char_coach 的内容来自已批准卡；受护栏约束。six-turn 上限只数非空孩子发言，本字第二次理解活动必须重新初始化该次教练进度。

## 每次操作的标识

- 所有四种 POST（start/event/homework/coach）必须有 `Idempotency-Key`，复用契约的 key schema。缺失或非法 400。请求正文结构延续原任务；标识不塞进 SessionEvent 或 SessionContext。
- UI controller 为一次新操作生成一个 ID，其重试闭包保留相同 ID；有意再答一句/再拍一张是新 ID。随机 ID 工厂从边界注入便于测试。排队的 quit 也算独立操作。LearningService 可增加可选操作 ID 参数，兼容假的 service；真实 HTTP 必须发送 ID。
- 服务端 scope：start 用 childId，其他用 sessionId；命令指纹包含方法、接口和规范化正文的 SHA-256。同 scope、同 ID、同内容返回已存结果；不同内容 409，不执行；并发同 ID 不得重复执行。不同 ID 的同会话命令串行，避免两次读取旧 coach/ctx 后覆盖。
- 去重记录必须持久化。增加内部 SessionCommand 和 CoachRuntime（或等价命名）表，不能改八张公共表含义。新增迁移，不改初始 migration。CoachRuntime 与 SessionContext 分开。
- 同一学习转换的 ChildChar/Session/SessionRuntime 与命令“转换已提交”检查点在同一短事务内；教练步骤推进与该命令完成记录也要原子提交。不要有“步骤已推进但命令仍可执行”的窗口。
- 外部效果放在事务外；命令记录保存可恢复的阶段和去图的待处理描述。若状态已提交而响应尚未完成，重启后重试同 ID 只能恢复外部效果/回复，不能再次 reduce、重复记学习结果、重复推进 coach。模型的外部调用在崩溃恢复时可能再次发生，报告如实区分它与学习状态恰好提交一次。
- 本轮是单 Node 服务进程的 SQLite 试点；同进程串行与持久化重启恢复必须成立。不宣称已支持多实例分布式锁。不能把仅 Map 缓存当持久去重。

## 时间与模型计量

- 服务端每操作外部 I/O 总预算 `SESSION_SERVER_BUDGET_MS=100000`，客户端总等待 `SESSION_CLIENT_TIMEOUT_MS=120000`。D2 各调用自己的限制不变。预算耗尽后用正常兜底完成或安全退出，不再启动更多模型；已提交的学习记录不能回滚。通过注入时钟、定时器/受控客户端验证，不实际等100秒。
- 长请求被客户端断开后，重试用同 ID 恢复，不能创建第二个会话或多算一句。服务端不能只 Promise.race 丢下继续推进状态的后台工作；已超时的工作不得迟到覆盖更新的状态。真实 fetch 应受总预算取消约束。
- 真实 LlmClient 在依赖工厂/服务启动创建一次。用请求上下文或包裹客户端把当前调用输入输出与 onTurn 配对；不可用全局可变 currentSession。每次 call 记录包含成功/失败，护栏最终结论与该候选对应，vision 的 guardVerdict 为 skipped。并发不同会话不能串账。记录失败不得被 D2 吞 onTurn 异常而悄悄丢失。

## 照片与失败路径

- 原图、base64、data URL 不得写入 Turn、Incident、日志、CoachRuntime、SessionCommand、响应快照或待处理效果。指纹仅存哈希；需保存的输入/响应用占位符替换图片。
- 同 ID 重放的图片由当次相同正文重新提供，只把它重新注入响应，不从数据库读图。进程内当前显示可持有图片；重启后的 GET 无原图则返回 photo_not_available 的安全呈现，退出不丢已提交进度。测试实际检查全部新增持久表和记录，不只查 Turn.input。
- 不增加重拍状态事件。本轮 compare 可本地重试解码，或正常退出；不可偷偷改成 capture，不伪造 correct。
- homework unsure=true 必须仍在 capture，提示重拍/重说。模型全失败时此规则与“完整认字状态序列”不能同时满足：原标准13的裁决是仍能通过正常退出→收尾→ended，禁止伪造清单；其他已进入的学习阶段用内容库/Agent兜底和六句上限保持能退出。成功模型的全状态流程仍严格按标准1验证。
- vision_dictation unreadable 或失败时保留全部 expected marks（使用已有可信兜底），box=null、suspicious=true，孩子能对照原图与标准字自行判断，不能把未识别当写对。

## 精确范围扩展

保留原 C7 路径，另允许：`prisma/schema.prisma`、`prisma/migrations/20261114_c7_runtime/`、`src/db/sessionCommand.ts`、`src/db/sessionCommand.test.ts`、`src/db/coachRuntime.ts`、`src/db/coachRuntime.test.ts`；以及 `src/ui/model.ts`、`src/ui/service.ts`、`src/ui/controller.ts`、`src/ui/LearningApp.tsx`、`src/ui/screens.tsx`、`src/ui/ui.test.ts`、`src/ui/integration.browser.ts`、`src/ui/playwright.config.ts`。仅做契约复用、ID/预算/正常兜底和真实接线测试，不重画界面。`reduce.ts` 除原 withResult 默认值保护不再新增状态转换。

## 新增验收标准（每条带编号的回归）

18. 成功全流程每一步 HTTP 响应均通过共享 Packet schema，并能被真实 UI decoder 消费；包含 ended、无效事件、unsure、缺卡和重启后缺图。
19. 响应丢失后 start 重试只有一个 Session；coach 重试只数一句/推进一次；事件重试学习记录只加一次。同 ID 异正文409；并发同 ID 与不同 ID 的同会话顺序有测试。
20. 真实 SQLite 故障注入：转换提交后、效果完成前失败；重建服务依赖（模拟重启）重试相同命令，状态与统计不重复。coach 步骤和命令完成的原子性也覆盖。
21. 检查所有持久表及日志，图片完整 data URL、base64 payload 均不存在；重放图片及无图 GET 的安全形状真实可用。
22. >8秒但预算内操作客户端能完成；总预算耗尽正常兜底；没有迟到任务重复写状态。时钟/定时器可控，无长时间真实等待。
23. 模型开始时学习状态已提交；两会话并发调用不串 Turn；失败调用也有记录。保留D1已有完整 ctx 往返与失败回滚测试。
24. 一次针对真实 UI+真实 HTTP handler/临时库+真实 Agent/护栏（仅模型假）的浏览器烟测；不再只使用固定响应 demo。不提供可在生产开启的假模型开关；测试可用独立临时测试入口/进程。

运行 focused 后再完整 verify；不要每新增一条测试都全套构建。报告逐条说明1–24、事务时序、重放/恢复边界和仍未做的真实模型评测。禁止在测试中递归verify，不降低阈值，不改其他包绕过失败。
