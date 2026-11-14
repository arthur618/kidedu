# C11B 正式裁决草稿（C11A后冻结）

实现家长日报/进度和人工复核，Sol high单agent。外部服务/真实凭据不配置，所有鉴权回归用工厂注入假配置；无真实凭据不阻塞本地实现。只用编造数据，不读private。原C11 B部分及下文适用。

## 默认关闭及会话

1. 环境PARENT_ACCESS_PASSWORD、PARENT_ALLOWED_CHILD_IDS均非空并合法时才启用；密码至少24字符（推荐随机口令，不提交实际值），child集合不能为空；本地示例只留空值。生产无fake绕过开关。未配置时公开status仅enabled=false，其他家长接口403和正常“家长入口暂未开启”，不返回家庭/孩子数据。
2. 登录JSON密码，恒定时间摘要比较；失败统一中文，限速不因进程重启无限绕过，不能信任任意X-Forwarded-For伪造桶。公开status不带childId。登录成功产生随机256bit opaque token，DB只存hash；24小时绝对过期、HttpOnly、SameSite=Strict、path限定，生产Secure；退出立即撤销。配置凭据/child集合指纹变化旧cookie失效。不记录密码、cookie、token或异常请求对象。
3. 所有数据接口在查数前鉴权/授权childId；越权与不存在统一404，不能凭枚举reportId、sessionId、incidentId跨孩子读。每次POST变更检查同源Origin与JSON（登录也检查同源），配置不从请求体/前端取得。cookie不能靠浏览器声明role。未登录、过期、伪造、注销重放、配置变化均回归。

## 日报、进度及复核

4. 家长主页只列授权孩子、日报列表/详情与当前ChildChar分阶段进度；分数只家长侧，模型摘要与事实区分，coverage缺失可读说明。有效0分与null/不可用必须区分，不能truthy判断吞掉0。无日报有正常空态，不因为打开页面触发夜间模型。只投影契约DailyReport，不能返回Nightly私有输入/作文原文/参考要点。分页/限制数量，不能一次把整库历史装浏览器。
5. 新增IncidentContext内部关联表，归属来自服务端当前Session的childId，不能信任请求childId。修改已知incident(deps,...)调用点传sessionId并在同事务插Incident+context；也可从真实Turn→Session安全解析归属。读取时核对context.childId与真实Session.childId、存在Turn时其sessionId一致，矛盾/孤儿关联不可跨孩子泄出。历史null turnId且无可信context的事件不能向任意家庭显示或解决，正常说明存在未归属历史记录即可，不能强行绑到默认孩子；未保存候选的事件只显示已有元信息，不声称可回放原始输出。
6. 复核页只给必要去媒体信息：type/固定安全note、时间、模型/agent元信息、resolved/revision等，不返回raw Turn输入/输出或活动全文。未知note先剔除媒体dataURL/URL/嵌入内容并限长；React文本渲染，不dangerouslySetInnerHTML、不加载外链媒体。缺上下文诚实显示，不伪造实际看见内容。
7. 人工resolved使用稳定Idempotency-Key与expectedRevision CAS，原Incident.resolved与revision/人工审计/请求结果同事务；同ID同body返回旧结果，同ID不同body409，不同ID过期revision409。审计actor固定parent、时间服务端、前后值和revision，不能从模型/请求传actor。双击只一条审计，注销/越权不能改；可以支持取消已处理但同样有审计。
8. 复核不改变ChildChar、Session或字卡status。需要修字卡继续C4 check→review→人工approve→import；此页不能一键approve或自动让模型resolve自己事件。

## 数据保留与入口

9. 默认无自动删除原始学习数据；批处理不做清理。提供授权孩子的删除范围预览（各私有/学习表计数、关联、生成时间/指纹，executable=false），只读，不实际删。UI明确“仅预览，实际删除需单独审核”，无确认即删的按钮。后续删除任务必须覆盖Turn/Incident/Context/审计、各活动/命令/日报/来源版本等引用一致性；内容库为共享不删除。不能把cookie过期称为学习数据删除。
10. 家长入口`/parent`，child UI无家长分数。移动375×667/平板1024×768，语义h1/label/按钮、键盘操作/退出、无横滚。未配置/未登录空态可用，日志无媒体/凭据；不做排行榜、打卡或奖励，不对外声称已公开部署。

## 范围及验收（冻结时确认）

拟scope：app/(parent)/、app/api/parent/、src/ui/parent/、src/server/parent/、src/server/effects.ts及src/server/reading/activity.ts和essay对应仅Incident归属接线路径、src/db/parent/、src/db/incident.ts、prisma/schema.prisma及prisma/migrations/20261114_c11b_parent/、src/ui/parent.browser.ts、tests/integration/parent/、.env.example，package/lock及reports/C11B.md。不修改夜间统计定义或Agent内部。新增DTO缺口只找root维护契约。

逐条独立验收：默认关闭不泄露；正常登录/凭据错误/限速/伪造过期注销/配置变化/跨孩子全部ID；CSRF与cookie属性；Incident缺归属/去媒体/并发CAS及重放审计；删除预览零写入/计数引用清楚；事实/模型文案准确展示；两尺寸真实UI→handler→迁移SQLite本地假配置烟测、必要verify/build。外部接口联调延后，root新clone重装复跑读生产代码，问题写review由原作者改，通过后直接合并推送。
