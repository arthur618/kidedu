# 任务报告：C8A 语音接口、内存录音与文字退路

- 实现者：Codex，Sol medium，单agent
- 分支：task/C8A
- 自查结果：`bash scripts/verify.sh C8A`四项通过；38测试文件、679测试通过，包含既有build.test真实Next生产构建。提交后的scope核对为17个文件，均在C8A范围内。
- 浏览器：`C7_BROWSER_PORT=3275 npm exec playwright test -- --config src/ui/playwright.config.ts`，单worker、`reuseExistingServer=false`，原10项加新增8项共18项通过（37.6秒）。
- 当前结论：实现者自查完成，等待总设计师独立验收。

```text
Test Files  38 passed (38)
Tests       679 passed (679)
范围检查通过：17 个文件都在 C8A 的范围内。
reports/C8A.md 存在
全部通过。
18 passed (37.6s)
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
| 8. TTS播放成功、拒绝/异常文字退路、换字时旧请求/播放取消、重复播放URL回收；迟到结果不能影响新字或退出。 | service.test.ts [4/8]；speech.browser.ts [8]两场景 | 通过 |
| 9. 原10浏览器+C8A真实speech handler烟测，两尺寸56px触控/无横滚/正常中文；测试服务factory注入假适配器而非生产开关。 | 原浏览器文件及speech.browser.ts | 通过 |
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

这是接口/假适配器验证；真实语音未接入，生产能力均false。测试音频只有编造字节，不是真实孩子录音；浏览器模拟MediaRecorder、getUserMedia和播放，没有连接硬件或真实供应商。
声明durationMs仅做字段验证，浏览器30秒硬停止不等于媒体实际声学时长验证。真实供应商、媒体实际时长/编码识别、识别质量、音色、账单、鉴权/防滥用与真实音频验证归C8B。本阶段不能宣称公开语音服务就绪。

补充验证：浏览器使用播放元素集合逐一追踪实际play/pause；approved URL换字、本地试听退出均断言旧元素不再播放。高精度performance.now差值取整数毫秒后进入共享契约，不把小数时长发送到服务端。

## 建议

C8B选定国内供应商后先用合成音频核对编码/实际时长与取消行为，再按负责人授权做本机试点。
