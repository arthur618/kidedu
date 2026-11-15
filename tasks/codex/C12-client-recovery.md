# C12 浏览器刷新与学习会话恢复

正式任务，2026-11-15；C11B已验收合并，契约2.10/scope现已冻结。单Sol high，跨持久命令/客户端生命周期/隐私与媒体边界需要较高思考；root独立验收，不额外审查agent。沿用已合并真实模块，不改模型Agent/护栏/纯状态机，不配接口、不读private、不调真实模型。

## 已确认缺口

HttpLearningApp每次挂载都start新会话，已有GET/幂等恢复没有接到整页reload。另createHttpService按child/lesson变化，但LearningApp的controllerRef仍持旧service，React复用组件时会混用旧绑定。目标是恢复已经提交的状态与操作，不能声称保存了未发送草稿。

## 服务端与契约

1. SessionContext没有lessonId，不从计划字表猜课次。新增内部SessionOrigin(sessionId主键/childId/lessonId)，只在新startSession成功的同事务取已验证输入建立；无新学习表字段、不裁剪ctx。读恢复前比对真实Session.childId、runtime.context.childId与origin.childId，且请求child/lesson与origin相同；旧会话无可信origin或任一矛盾均404，不从浏览器补写历史归属、不改旧GET含义。
2. 新POST /api/session/[id]/resume只收SessionRecoveryRequest，不收原孩子输入、照片或任意事件。无operationId时只读当前安全快照，不推进模型；有已存在的同session操作ID时按既有持久phase恢复，只续未完成效果、不新建command/不重复reduce，返回当前权威快照。已complete/rejected也不重新学习或模型调用。未知/别的session的ID都operation_missing+当前快照，零写入；客户端正常说明刚才内容未送达，可重新填写，不能用空body假作一次回答。
3. 沿用同会话锁、100秒模型总预算、短事务/外部模型、持久私有Essay命令和完成投影；如有多个未完成操作按既有sequence先后恢复，不能凭随意ID越过旧检查点。响应必须按RecoveryResponse/Packet parse后的公共值序列化，不返回command.pending、EssayWork、ctx或私有原题/参考要点。已退出/ended不回滚或重开。缺照片继续既有正常退路，不把<image>当实际图片发模型/不据缺图记对错。
4. Session.startedAt/limitMinutes原样保留；恢复待执行动作仍受既有超时限制，无pending纯读不伪造学习事件。原始开始请求若响应丢失，客户端复用startRequestId+原IDs/hasEssayToday，继续原child scope请求，不新建第二个会话。

## 客户端

5. 只用sessionStorage，按child+lesson绑定存SessionRecoveryHint，精确schema无额外字段，序列化UTF-16长度8192上限（以冻结schema为准，不称严格字节限额）；在网络提交前先存标识，成功校验响应后更新会话ID并清pending。不得存完整Packet/ctx/请求body、孩子原话、作文、图片、音频、base64/BlobURL或其可逆表示，也不用localStorage/IndexedDB。SSR/禁用或损坏/额度满的存储正常退为本次内存流程，不裁剪ID、不阻止学习、不输出存储内容。
6. 有sessionId挂载先resume，pendingID存在则由服务端取既有载荷继续，不要求孩子重说导致跳轮。未知操作保留原会话/当前屏幕、清旧pending并提示重新填写；不存在/错误绑定会话给正常明确重新开始入口，不自动无限start。ended保持结束，只有孩子明确点击重新开始才清hint并生成新start ID。无stash才正常start。
7. child/lesson变更必须新controller/service绑定并取消/隔离旧代次；旧响应不能覆盖新孩子，不能给新sessionId误发旧请求。网络重试仍同ID，新实际动作新ID；换绑定/卸载/整页reload清媒体资源、不写媒体存储。保持busy时quit排队语义；React StrictMode挂载/清理/重挂不能双建会话或永久卡busy。未发送编辑草稿/未确认录音跨整页刷新不保存，文档明确这一点。
8. 不为恢复新增供应商/模型调用；常规只读reload零模型，只有真正未完成效果恢复可能按既有重试收费，不能宣称exactly-once。默认文字路径/语音关闭继续可用；不泄露实现/存储/供应商术语给孩子。

9. SessionOrigin也属于删除范围预览：只按已验证真实孩子会话计数，不把矛盾/孤儿归属计入别的孩子。为新内部表补计数和中文标签，仍executable=false、不做删除，不改鉴权/CAS/原18类计数语义。旧parent fixture无origin应为0，新真实start后应仅计所属孩子1条。

## 精确scope

src/server/runtime.ts、src/server/http.ts、src/server/README.md、app/api/session/[id]/resume/、src/db/sessionOrigin.ts、prisma/schema.prisma、prisma/migrations/20261115_c12_origin/、src/ui/recovery/、src/ui/HttpLearningApp.tsx、src/ui/service.ts、src/ui/controller.ts、src/ui/LearningApp.tsx、src/ui/screens.tsx、src/ui/ui.test.ts、src/ui/recovery.browser.ts、tests/integration/recovery/；另精确允许src/db/parent/store.ts仅新增可信origin预览计数、src/ui/parent/ParentApp.tsx仅新增该表中文标签、tests/integration/parent/http.test.ts仅18→19计数及origin归属回归；package/lock及reports/C12.md。另精确允许src/ui/speech.browser.ts仅[7]编辑/重录/退出用例把同绑定再打开改为先验证续接wrap_up、显式开心结束与重新开始再进权限子场景，保留全部track/迟到断言；src/ui/e2e.browser.ts仅每屏幕quit循环及图片压缩第二独立mock子场景使用不同fixture lessonId隔离hint，不新增fake resume或删断言。contracts/reviews/看板/root scripts只读，不改C11B鉴权/评分语义；迁移只增加origin内部表。

## 验收

1. 实际浏览器reload同一session继续，数据库Session计数不增；已完成认字、阅读一条回答后、采访/卡片、已提交作文反馈均不重复学习/卡/正文/score。原开始响应丢失后reload只一session；stable ID贯穿丢响应/重试。
2. 真迁移SQLite注入prepared/transitioned/complete提交故障，重建service模拟进程重启，再由真实resume端点恢复，效果/流水/原话/卡/command一次；图片遗失正常退路、退出后旧请求不复活；无pending只读零模型零业务写入。
3. operation缺失/foreign、session/child/lesson错配、无origin、origin矛盾、legacy会话、404/暂时网络失败都无越权/假推进，明确重新开始只由点击发起；退出/ended不会自动新开。
4. UI复用组件只改child/lesson、旧请求迟到、两绑定来回、StrictMode双effect、sessionStorage禁用/坏JSON/超长/旧版本、双击重试均真实证明隔离/不误提交；跨refresh未提交草稿不声称恢复。
5. sessionStorage全量快照及localStorage/IndexedDB/所有表/日志canary证明恢复存储仅标识，无媒体/原文/Packet或新私有输出；保留C7/C8A/B所有媒体清理/迟到退路。手机375×667和平板1024×768必要reload场景，真实UI→handler→SQLite；不靠fake转码/假恢复成功。
6. focused集中自审后预约一次最终verify C12和全浏览器串行，报告准确scope/contracts0/实际build/真实接口仍未测。root新clone读生产代码、自跑探针/完整回归，问题由原作者改，root不代实现。不要复跑无根据的重型检查。
