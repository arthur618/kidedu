# 任务报告：C8A 语音接口、内存录音与文字退路

- 实现者：Codex，Sol medium，单agent
- 分支：task/C8A
- 自查结果：`bash scripts/verify.sh C8A`四项通过；38测试文件、679测试通过，包含既有build.test真实Next生产构建。提交后的scope核对为17个文件，均在C8A范围内。
- 浏览器：`C7_BROWSER_PORT=3275 npm exec playwright test -- --config src/ui/playwright.config.ts`，单worker、`reuseExistingServer=false`，原10项、原新增8项及F1新增3项共21项通过（46.8秒）。
- 当前结论：首次独立验收F1未通过；本次已修复并完成实现者完整自查，等待总设计师独立复验。

```text
Test Files  38 passed (38)
Tests       679 passed (679)
范围检查通过：17 个文件都在 C8A 的范围内。
reports/C8A.md 存在
全部通过。
21 passed (46.8s)
```

## 做了什么

新增供应商无关的有限预算服务、只接收契约正文的HTTP handler和三条薄路由。生产ASR/TTS固定null，假适配器只通过工厂在测试注入，不配置真实服务。录音在内存转录为可编辑文字，仍由孩子按原按钮提交原C7操作；有本地试听和全部取消/释放边界。报词优先approved audioUrl，否则在能力可用时请求approved dictationContext的TTS，不能播放时显示原文字。

## 验收标准对照

| 验收标准 | 测试 | 状态 |
| --- | --- | --- |
| 1. 生产caps均false且ASR/TTS零fetch/SDK；默认文字/self_report可走完原C7流程。 | src/speech/service.test.ts [1]；原C7真实UI浏览器完整流程 | 通过 |
| 2. 音频正文MIME、空值、非规范base64、字节数边界、声明时长边界正反例；不能接受HTTP/data URL字段绕过。 | src/speech/service.test.ts [2] | 通过 |
| 3. ASR假适配器成功/空结果/坏结构/拒绝/异常/超时均测，信号真实取消；输出不会自动提交学习事件。 | service.test.ts [3]；recorder.test.ts [3/7/8]；speech.browser.ts [6/9]与[7] | 通过 |
| 4. TTS只用approved card的dictationContext；draft、缺卡、任意text正文不调用适配器；返回音频格式/空/过大校验；正确二进制头与no-store。 | service.test.ts [4]与[4/8] | 通过 |
| 5. 真实handler+编造临时SQLite字卡+假适配器集成；所有持久表与控制台无音频base64/bytes，learning/Turn/命令数不因语音改变。 | tests/integration/speech/handler.test.ts [5]，逐表快照和控制台检查 | 通过 |
| 6. 浏览器模拟getUserMedia/MediaRecorder，录音→停止→编辑→手动发送；权限拒绝仍可完整文字流程。不连接真实硬件或真实服务。 | speech.browser.ts [6/9]两尺寸与[6] | 通过 |
| 7. 手工编辑后/重录后/卸载后旧转录、晚到权限、30秒自动停止的回归；检查tracks/定时器/请求/URL释放。 | recorder.test.ts [6/7]与[7]；speech.browser.ts [7] | 通过 |
| 8. TTS播放成功、拒绝/异常文字退路、换字时旧请求/播放取消、重复播放URL回收；迟到结果不能影响新字或退出。 | service.test.ts [4/8]；speech.browser.ts [8]两场景及[F1/8]两场景 | 通过 |
| 9. 原10浏览器+C8A真实speech handler烟测，两尺寸56px触控/无横滚/正常中文；测试服务factory注入假适配器而非生产开关。 | 原浏览器文件及speech.browser.ts（含F1三场景） | 通过 |
| 10. verify.sh C8A四项及真实生产构建通过，scope不越界、无递归自查测试；报告区分“接口/假适配器已测”与“真实语音未接入”。 | scripts/verify.sh C8A，测试不调用verify | 通过 |

## 改动的文件

- src/speech/service.ts、service.test.ts
- src/server/speech.ts
- app/api/speech/{capabilities,transcribe,synthesize}/route.ts
- src/ui/speech/{client.ts,context.tsx,recorder.ts,recorder.test.ts,input.tsx,playback.tsx}
- src/ui/HttpLearningApp.tsx、screens.tsx、speech.browser.ts
- tests/integration/speech/handler.test.ts
- reports/C8A.md

## 新增依赖

无。

## 契约问题

无。SpeechToText直接使用契约可选第三参数，原两参数调用不变。所有正文/schema、MIME/预算/上限直接导入契约2.3。

## 没做的和已知问题

这是接口/假适配器验证；真实语音未接入，生产能力均false。测试音频只有编造字节和在内存合成的单采样静音WAV，不是真实孩子录音；浏览器模拟MediaRecorder、getUserMedia和播放，没有连接硬件或真实供应商。
声明durationMs仅做字段验证，浏览器30秒硬停止不等于媒体实际声学时长验证。真实供应商、媒体实际时长/编码识别、识别质量、音色、账单、鉴权/防滥用与真实音频验证归C8B。本阶段不能宣称公开语音服务就绪。

补充验证：浏览器使用播放元素集合逐一追踪实际play/pause；approved URL换字、本地试听退出均断言旧元素不再播放。高精度performance.now差值取整数毫秒后进入共享契约，不把小数时长发送到服务端。

## 建议

C8B选定国内供应商后先用合成音频核对编码/实际时长与取消行为，再按负责人授权做本机试点。

## 首次独立验收 F1 修复

已读总设计师reviews/C8A.md。原实现只处理play Promise拒绝，未覆盖播放开始后的原生media error；本次报词播放按当前元素和播放generation绑定error监听，错误时停止播放、取消请求、回收URL并显示approved dictationContext。换字/退出/重播清理旧监听，旧DOM元素迟到error不能回调新状态。本地试听按当前元素和preview URL检查原生error，失败释放预览并显示正常中文，保留可编辑文字；每次录音使用独立audio元素，重录/退出后忽略旧事件。

新增speech.browser.ts三项[F1/8]与[F1/7]，真实Chromium中先模拟play成功，再派发原生error，分别验证approved audioUrl、TTS Blob、本地试听；额外保留旧DOM元素，在换字/重录/退出后派发error，核对提示、文字、播放/URL计数与学习命令数不受影响。正常音频可用时仍不提前显示标准字。为隔离测试夹具自身的坏编码解码错误，供应商假音频、模拟录音和假approved URL均只在内存使用合成静音WAV；没有真实硬件或供应商。

Focused F1浏览器3项通过（16.8秒）。修复后最终`verify.sh C8A`四项通过：38文件/679测试，包含既有build.test真实生产构建，scope17文件通过；随后原18+新增3浏览器单worker共21项通过（46.8秒）。只使用3275空闲端口且不复用服务。Next自动AGENTS/next-env/tsconfig和本次截图改动已核对恢复。最终日志位于`/private/tmp/c8a-f1-verify-final.log`及`/private/tmp/c8a-f1-browser-final.log`。
