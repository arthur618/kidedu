# 任务报告：C8B DeepSeek语音适配（本地代码阶段）

- 实现者：Codex，Sol high；唯一实现者，root独立验收。
- 分支：task/C8B；基于 main@8107b98。
- 代码验收基准SHA：184c6df2c71636754fc08e61c405b5939a8ef128（代码及测试）；最终报告提交SHA由交付消息提供。
- 自查结果：focused 33/33、typecheck通过；新增native浏览器6/6通过；最终 `bash scripts/verify.sh C8B`：46文件、801测试通过（包含src/server/build.test.ts真实Next生产构建），16文件scope/报告检查通过，输出“全部通过。”；最终全浏览器33/33通过（原27+新增6），单worker串行。

## 做了什么

用可关闭的服务端工厂接入固定DeepSeek官方ASR/TTS地址，只有DEEPSEEK_SPEECH_ENABLED精确为true且DEEPSEEK_API_KEY非空时启用。所有示例环境值为空；未读私有文件、未创建实际.env、未配置或查找真实key。上游redirect:error，不跟随重定向，不重试收费请求。

保留C8A内存录音试听，上传前通过真实Web Audio解码、均值混音和时间窗积分重采样，编码PCM16单声道16k WAV。转码与网络共用12秒预算；服务8秒；正常文字退路、取消和generation隔离继续复用。阅读复述和作文采访仅填可编辑短回答框，孩子确认后才走既有稳定ID接口；长作文仍手写。

完整读取并验证TTS后才返回播放，不边生成边播。音频仅在请求/浏览器内存；不写Turn、Incident、DB、日志、磁盘或命令。所有测试音频均在内存合成，HTTP/模型均为测试服务；未调用真实DeepSeek，C8B-live仍未完成。

## 验收标准对照

| 正式验收1–10 | 测试与证据 | 状态 |
| --- | --- | --- |
| 1. 缺key/关闭零网络、开启仅固定官方地址/服务端Bearer，key/媒体输出隔离，原27浏览器/文字不回退 | provider.test.ts“缺key/关闭”“真实FormData”；redirect:error断言；privacy.test.ts全表/console；native浏览器实际脚本检查；最终原27项全部通过 | 本地通过 |
| 2. Native编造MediaRecorder实际解码→PCM16 WAV，手算头/字节/采样/时长，两尺寸全内存 | src/speech/wav.test.ts手算-32768/16384/32767及44+frames×2；deepseek-speech.browser.ts 375×667/1024×768三类录入，真实振荡器MediaStream→原生MediaRecorder(WebM)→真实AudioContext→16000Hz非零WAV；不stub转码 | 本地通过 |
| 3. 假HTTP真实multipart/WAV/无pinyin，格式/空/错误/拒绝/取消/忙边界 | provider.test.ts；privacy.test.ts真实回环HTTP与Request.formData；src/speech/wav.test.ts真实header、帧、30秒/2MB限制；ASR只返回text及[] | focused通过 |
| 4. TTS仅approved字段/完整有界WAV，空/截断/坏MIME/超长/失败/取消/URL优先及原生media error | provider.test.ts完整读取/分段完成/中断/长度/错误；原speech.browser.ts approved URL、TTS Blob、预览native error3项保持；service.test.ts审核卡/任意text拒绝 | 本地通过 |
| 5. 非合作解码/模型迟到，编辑/重录/退出无覆盖，生命周期/预算/并发/零自动重试 | src/ui/speech/wav.test.ts迟到解码、9秒转码+3秒HTTP；recorder.test.ts权限/30秒/取消；provider.test.ts2个并发、超时继续占位、reader.cancel、同步取消不泄漏；native浏览器跟踪context/轨道/URL及退出迟到 | 本地通过 |
| 6. 三类转录只填编辑框，阅读/采访确认仅提交一次，不自动判正确/素材/阶段，长稿保留 | 原speech.browser.ts作业/understand；新增native三类短录入全表计数/手动双击只+1/私有transcript与utterances/cards确认前为空；长稿手写/卡选择保留 | 本地通过 |
| 7. 全持久表/console/异常/静态包无音频和key，仅编造canary | privacy.test.ts遍历Prisma全部model，真回环HTTP前后快照相等，原字节/base64/key/canary隔离；provider.test.ts错误/key/媒体回显；native浏览器加载脚本检查服务端key与URL不进入client | 本地通过 |
| 8. focused集中自审后最终verify C8B含真实build、全浏览器串行、提交后scope/报告/contracts0 | focused/typecheck通过；最终verify 801/801及真实build、全浏览器33/33、scope16文件通过；遵守root独占预约窗口，串行完成 | 本地通过 |
| 9. 支持规范WAV/未测硬件、并发/费用/中断边界、依赖及真实限制 | 见以下明确范围和限制 | 已明确 |
| 10. C8B-live待安全配置key，先合成材料真实ASR/TTS/取消/结构/费用，再负责人安排真实试点 | 本轮没有真实key、真实供应商请求或真实儿童材料；不计原C8第7条真实服务通过 | 未完成，按任务保留待key |

## 改动的文件

提交后 `git diff main...HEAD --name-only` 的16个实际文件：

- `.env.example`
- `reports/C8B.md`
- `src/server/speech.ts`
- `src/speech/deepseek.ts`
- `src/speech/http.ts`
- `src/speech/wav.test.ts`
- `src/speech/wav.ts`
- `src/ui/deepseek-speech.browser.ts`
- `src/ui/essay/screens.tsx`
- `src/ui/reading/screens.tsx`
- `src/ui/speech/client.ts`
- `src/ui/speech/recorder.test.ts`
- `src/src/ui/speech/wav.test.ts`
- `src/ui/speech/wav.ts`
- `tests/integration/deepseek-speech/privacy.test.ts`
- `tests/integration/deepseek-speech/provider.test.ts`

提交后scope检查通过，`git diff main...HEAD -- src/contracts`为空；contracts文件改动0。Next生成的AGENTS.md/next-env.d.ts/tsconfig.json及既有截图差异已保存至工作树外的生成差异patch并仅还原这些已知生成文件，不提交范围外变更。

## 新增依赖

无。使用浏览器Web Audio/MediaRecorder和Node内置fetch/FormData/ReadableStream。

## 契约问题

无；src/contracts差异0。SpeechToText无拼音时返回[]，不补造字词知识。

## 没做的和已知问题

- **C8B-live未完成**：没有真实供应商联调/质量/计费/真实取消效果证据。需负责人在服务器安全配置密钥后重启服务，用合成材料先验证；不应把key贴聊天或把真实孩子录音发给编码agent。
- ASR只收本项目44字节标准RIFF/WAVE/fmt16/data头、PCM格式1、16bit、单声道16000Hz、整帧、精确RIFF/data长度的WAV。TTS完整WAV允许同一标准头、单声道PCM16，采样率8000/16000/22050/24000/32000/44100/48000Hz；均非空且≤30秒/2MB。拒绝额外chunk、扩展fmt、立体声、RF64、未知长度/0xffffffff流头等合法但本版未实现变体。真实DeepSeek HTTP流式WAV布局未知；即使真实响应合法，未匹配此子集也正常退路，不能称全格式兼容。ASR duration_ms须有限、>0且≤30000，并与实际帧时长差≤100ms，以容许供应商毫秒取整。
- Chromium仅内存合成音轨实测；未测物理麦克风/真实儿童发音/降噪、Safari MP4或Firefox、移动硬件和所有编解码器。Web Audio缺失或解码失败不上传，使用文字；未做云语音、外部转码、ffmpeg或文件缓存。积分重采样为首版，语音识别质量需真实联调评估。
- 客户端12秒预算含解码+转码+上传+响应；非合作解码可能继续内部计算，AudioContext已请求关闭且迟到结果永不上传/覆盖。标准浏览器context.close为异步，不能保证强制终止浏览器内部codec。
- 每进程合计ASR/TTS最多2个供应商请求，无排队/自动重试。若网络实现不响应abort，逻辑预算仍及时退路，旧请求占位到实际settle，宁可忙时暂不可用；多进程须后续共享限流。8秒取消不能保证厂商停止已开始计费；显式点击重录/再听属于新操作，可能再次收费。本轮没有真实费用测量。
- 试听使用原MediaRecorder Blob，转码WAV只用于上传；两者不保存文件。TTS只在整段读取及结构一致后播放，流中断、内容长度不符和不能验证完整的未知头全部退路；未做WS或断点续传。

## 建议

后续C8B-live先用合成材料核实厂商实际WAV流头和duration/费用/取消边界，再决定是否扩展可验证的WAV chunk解析；由负责人安排真实试点与硬件兼容测试。本包不扩大API、契约或学习判断规则。
