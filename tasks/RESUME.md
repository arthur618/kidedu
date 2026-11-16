# 项目接续说明

更新时间：2026-11-16。远端：https://github.com/arthur618/kidedu 。本文件与tasks/STATUS.md描述当前状态；docs/HANDOFF.md保留最初交接背景，历史过程见Git与reviews，不要按旧进度重做已合并任务。

## 已完成与正在进行

主线已合C1、D2、D1、C3、C5、C2、C4、C6脚本、C7、C8A、C9、C10、C11A、D2B、C8B代码、C4B代码、C11B、C11C、C12、C13。每包正式裁决见reviews/<任务号>.md，初次不通过的历史由后续通过记录关闭。

- C12@0f0630b合并25a51c2：刷新续接已提交会话/操作，仅标识sessionStorage、可信SessionOrigin、真实StrictMode和跨孩子/课次隔离。独立1023测试/实际构建与53浏览器通过。未发送草稿不跨刷新保存。
- C13@64ce6cb合并7c96bce：Prisma/client6.19.3、限定deepmerge8、Vitest4.1.12、Vite6.4.6。独立与实际main干净安装后62文件1027测试/生产构建通过；收集集合完整，恢复/审计事务及默认关闭生产canary通过。有效官方在线审计仅剩Zod high1，不用离线ci的0替代。
- 契约2.11已冻结：parent counts双参字符串record、Turn input/output显式optional，保留旧Zod3缺键/nullable语义。root已在旧依赖通过typecheck、DB8例和直接兼容探针。
- C14@724dde9已独立验收并合并b151f60：65文件1045测试/实际构建、53浏览器、实际DB/恢复/事务和生产canary、官方在线audit0通过；实际main重装复验1045测试/构建通过。旧测试未修改，原已知依赖告警关闭。

## 当前产品与未验证边界

孩子端/learn：认字、approved阅读/点字卡、两轮复述、作文采访/原话素材和反馈；不代写作业句子。私有参考要点只在服务端。夜间事实日报/符合首问来源的评分已接真实流水，家长端/parent有默认关闭鉴权、跨孩子授权、人工复核审计和只读删除预览，无真实删除入口。

DeepSeek聊天协议/有限预算/拒答处理、固定ASR/TTS、真实内存PCM16 WAV转码、approved报词及短回答可编辑录入已在代码阶段验收。离线公开资料检索仅产reference_only文件，仍需人工审批，不给孩子开放自主联网工具。详情见docs/DEEPSEEK-INTEGRATION.md。

负责人2026-11-16已授权合成材料真实评测，待本机密钥配置完成确认和费用上限；仓库保持公开，DEEPSEEK_API_KEY、语音/搜索开关、家长口令示例均留空。C6真实模型质量、供应商实际语音头/识别质量/取消延迟/收费、实体麦克风与Safari等仍未验收。假HTTP/合成数据/Chromium通过不等于真实供应商通过；不读取已存在.env/private/真实孩子数据库，也不让用户把key贴聊天。单Node队列、外部at-least-once/可能再次计费等边界见各review，不承诺模型exactly-once。

## 换电脑继续

获取远端main，先读AGENTS、docs/ARCHITECTURE.md、docs/WORKFLOW.md、全部src/contracts、看板、对应任务/review。检查分支与未提交内容，不强推，不用旧恢复包覆盖新提交。环境变量、SSH私钥、node_modules、缓存及真实数据库不随Git迁移。

Node22、npm ci；临时测试清除RUST_LOG，Prisma缓存使用可写XDG_CACHE_HOME。只用合成数据按迁移初始化开发库，必要时导入编造seed。实际依赖兼容要求与override撤除条件见docs/DEPENDENCIES.md；Node22.1被engine允许不代表该旧Node已完成安全维护审查。

全套verify已含真实Next构建，不再重复build；全套verify/build/browser全项目串行。浏览器回环测试仅清除该进程代理，NO_PROXY=127.0.0.1,localhost，用空闲C7_BROWSER_PORT与独立服务，不复用/终止不明进程。Next可能生成AGENTS/next-env/tsconfig和旧截图，先保存diff再只恢复已确认的生成文件，不能覆盖实现工作。

## 分工与后续

总设计师维护contracts、任务/scope/status和review；另clone重装复跑、读生产代码后裁决，问题交原作者改，不代写任务实现。负责人已授权总设计师直接合并验收通过分支并同步GitHub，无需负责人执行终端命令。实现者不派agent、不合并推送、不改契约/看板/review。

模型按任务复杂度选；C13/C14范围明确复用Sol medium，复杂生命周期/媒体/鉴权任务用Sol high，不为机械操作另开agent。完整规则见tasks/MODEL-ROUTING.md。按tasks/VALIDATION.md继续真实评测、人教三年级上册前两课内容审校和一次家长陪同试用。具体该版课后生字表待核对，暂停新功能扩展。

## 最新：首次真实评测与返工（2026-11-16）

主线已合D2C（04c530f），独立/main1052测试/实际构建通过；供应商text/high参数已真实回测。负责人已配钥匙串并授权5元，179公开合成集已跑、94真实HTTP成功，前三类未过原质量线，详情reviews/C6-live.md。18失败含规则误报，原成绩不改；认字一例直接给组词答案是真问题，已冻结C3B单Sol medium。评测规则修改正在等负责人明确裁决，不擅自改标准。所有key仅root进程内读取不落盘/不发agent；保守用量账0.670862元，供应商实际账单未核对。语音/搜索/私有听写/真实孩子仍未验证。后续按当前lookboard，不重做已验收包。

## 最新：C3B已合，等待规则裁决与内容来源

main c0a0b6a已复验66文件1076测试/实际构建，C3B独立服务链/临时SQLite及3例真实定向回测通过泄答边界，原评测未全绿，详见reviews/C3B.md。当前实现agent全部空闲，不要重复实现或再调用真实模型。总保守计量0.676406元（实际账单未核对）。下一步来源规则修订已发给负责人选择，尚未明确答复前不修改checks；人教3上前两课待该版课后生字表与人工终审。不做新功能扩展。

## 最新：C6B/C8C已合并，实施收尾

用户明确批准C6B规则修订，已通过返工独立反例验收并合入；C8C流式WAV修复已合。主线干净安装/类型/68文件1157测试含实际构建通过（文件workers=4，未改内部并发/隔离/超时）；原默认并行DB钩子波动和单项浏览器收尾波动均留review。当前所有实现agent已完成，无需重启。

API附件相关章节已审读并与代码/官方指南核对，docs/DEEPSEEK-API-AUDIT.md保留来源hash和能力表。搜索200/reference_only；真实TTS未知流头经限定规范化后，内存重采样→ASR回合成测试文本。音频/key未落盘，真实硬件/孩子语音质量未测。总保守预算账上限0.876406元；无新增付费复评。旧179+3输出派生复评在evals/reassessments（有原hash/checks提交号），原JSON不动，认字余1部件引用保守误报记录，不能把自动来源分数当所有教学验收。

下一步是人教3上前两课对应版生字页/人工审校入库，再由家长陪同孩子试用；不新增功能或重复调用模型。仓库保持公开，SSH用已存在的非默认身份id_ed25519_ai正常push，勿读取/输出私钥；API key仅root在被授权请求进程用security管道读deepseek-api-key，未交子agent。
