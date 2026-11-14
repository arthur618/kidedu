# C8A 语音接口、内存录音与文字退路

- 分支：task/C8A。C7已合并，契约2.3已冻结。
- 模型：Sol medium单agent。真实供应商仍未确定，本任务不得查密钥、调用真实语音/模型或配置生产假服务。
- 先完整读AGENTS、架构、contracts全部5文件、C8-speech.md、本任务及C7的恢复/取消边界。
- 本任务允许导入真实approved字卡读取与现有孩子界面作适配，作为AGENTS独立包限制的明确集成例外；不能改其他包内部。

## 冻结的接口与产品行为

1. `src/contracts/speech.ts`新增音频MIME、2MB、30秒录音、服务8秒/客户端12秒预算、HTTP结构及TextToSpeech；原SpeechToText只加可选第三参数mimeType/signal，旧两参数调用不变。直接复用，不能自建副本。
2. `GET /api/speech/capabilities`返回asr/tts布尔值。生产依赖固定asr=null、tts=null；不从请求/env开启假适配器，不接供应商SDK，不用Web Speech API/speechSynthesis。假适配器仅在工厂和测试注入。
3. `POST /api/speech/transcribe`接收共享正文。严格核对规范base64、解码非空/≤2MB、白名单MIME及声明durationMs。成功返回ok/text/pinyin；关闭、超时、空/坏输出/异常返回200 unavailable；非法正文400 unavailable。录音30秒由浏览器硬停止；声明时长校验不等于解码声学时长验证，C8B接真服务前再补实际媒体验证，报告如实说明。
4. `POST /api/speech/synthesize`只接受char，从真实getCharCard只读approved并再次确认status。只把dictationContext交给注入TTS，不能接受任意text、现编词语或读音。成功返回有正确Content-Type的≤2MB非空音频，其他正常200 unavailable；非法正文400。响应均no-store。生产关闭时零外部调用；无新数据库/媒体缓存。
5. SpeechToText输入包含规范MIME及AbortSignal；TextToSpeech同样可取消。时钟/定时器可注入；取消/超时后迟到结果不回调、不写任何状态，音频本身无日志/数据库/磁盘/Turn/Incident/命令记录。
6. 在作业文字输入、understand输入旁接可选录音按钮。capabilities.asr=false时保留原文字界面，不弹权限也不显示供应商技术信息。可用时“开始说”→“说好了”→转录填入可编辑文字→孩子仍点原提交按钮。**转录不得自动发homework/coach/event，也不得判断recognize正误**。
7. getUserMedia拒绝/不存在、无MediaRecorder、空片段、格式不支持、异常、超时均显示正常中文并保留原文字。手工编辑、重录、离开/退出后旧结果不能覆盖文字；晚到的权限stream也必须stop所有tracks。录音最长30秒，停止/卸载释放stream、recorder、timer、请求与ObjectURL；不使用真实麦克风测试。
8. DictationPlay保持approved card.audioUrl已有播放优先；没有URL且capabilities.tts=true时用char请求TTS并播放内存Blob，否则原dictationContext文字退路。播放/再听/下一个顺序不变；换字/退出时取消旧请求/音频并回收URL，迟到播放或错误不污染下一个字。合成音频不可持久缓存。
9. 共享语音client/context/组件放src/ui/speech/，现有screens只做输入与播放适配，不重画设计。演示/SSR渲染可默认禁用语音，不因capabilities网络错误卡住原认字流程。

## 允许路径

src/speech/、app/api/speech/、src/server/speech.ts、src/ui/speech/、src/ui/HttpLearningApp.tsx、src/ui/screens.tsx、src/ui/ui.test.ts、src/ui/speech.browser.ts、tests/integration/speech/；package/lock及reports/C8A.md按总规则。禁止改contracts、主scripts、其他server/DB/Agent/guard/orchestrator、C7测试或图像工具。精确列表已写scopes。

## 验收标准（每条有编号测试）

1. 生产caps均false且ASR/TTS零fetch/SDK；默认文字/self_report可走完原C7流程。
2. 音频正文MIME、空值、非规范base64、字节数边界、声明时长边界正反例；不能接受HTTP/data URL字段绕过。
3. ASR假适配器成功/空结果/坏结构/拒绝/异常/超时均测，信号真实取消；输出不会自动提交学习事件。
4. TTS只用approved card的dictationContext；draft、缺卡、任意text正文不调用适配器；返回音频格式/空/过大校验；正确二进制头与no-store。
5. 真实handler+编造临时SQLite字卡+假适配器集成；所有持久表与控制台无音频base64/bytes，learning/Turn/命令数不因语音改变。
6. 浏览器模拟getUserMedia/MediaRecorder，录音→停止→编辑→手动发送；权限拒绝仍可完整文字流程。不连接真实硬件或真实服务。
7. 手工编辑后/重录后/卸载后旧转录、晚到权限、30秒自动停止的回归；检查tracks/定时器/请求/URL释放。
8. TTS播放成功、拒绝/异常文字退路、换字时旧请求/播放取消、重复播放URL回收；迟到结果不能影响新字或退出。
9. 原10浏览器+C8A真实speech handler烟测，两尺寸56px触控/无横滚/正常中文；测试服务factory注入假适配器而非生产开关。
10. verify.sh C8A四项及真实生产构建通过，scope不越界、无递归自查测试；报告区分“接口/假适配器已测”与“真实语音未接入”。

录音不进入C7命令日志；只有孩子确认的转录文字复用既有稳定操作ID流程。真实供应商、实际媒体时长/编码识别、ASR质量、音色、账单、鉴权/防滥用和真实音频验证归C8B，不把本阶段宣称可公开语音服务。
