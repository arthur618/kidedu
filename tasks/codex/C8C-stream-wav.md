# C8C 真实TTS流式WAV文件头兼容

2026-11-16。仅修已观察到的供应商兼容问题，Sol medium实现、root独立验收。生产配置/密钥/协议/上限不改，不接新语音功能。

## 证据

root经现有createDeepSeekSpeech真实请求短合成文本“你好。这是语音测试。”，HTTP200/audio-wav，正常EOF共99884字节，fmt16/PCM1/mono/24kHz/16bit/data在36；RIFF和data长度均为0xFFFFFFFF。现有inspectPcmWav只接受明确长度44字节规范头，TTS返回null，ASR因此尚未测试。音频仅内存，证据只存头字段，不包含音频/孩子录音。搜索适配已真实成功，不在本包范围。

## 裁决与scope

只允许src/speech/wav.ts、src/speech/deepseek.ts、src/speech/wav.test.ts（原严格负例不能减）、tests/integration/deepseek-speech/stream-wav.test.ts（新增）、src/server/README.md及reports/C8C.md。contracts、http.ts、service、其他旧测试、UI/ASR路由/依赖/配置只读。使用已合main新task/C8C；不得读key/钥匙串/private，不发真实请求，不派agent，不合并推送。

1. 仅在TTS经过原readSpeechBody完整有界读取、正常EOF成功后，对**实际观察的成对0xFFFFFFFF RIFF/data字段、固定44字节PCM16单声道头**做限定规范化：用实际收到的长度重写两个字段，复制不修改输入，再调用原严格inspectPcmWav核验全部其余字段/大小/帧/时长。已规范WAV保持兼容。实现可采用小型纯函数，不写通用RIFF解析器。
2. 不能在收到首块或HTTP200时当成功。网络流错误、外部取消、超时、Content-Length不符、奇数帧/空payload、坏magic/fmt/rate/channels/bits、超2MiB/30秒、已知长度不符继续拒绝；不通过clamp、补零或修正其他坏字段接受脏音频。不接受只有一个sentinel或未经设计的其他未知长度值/扩展chunk。
3. **ASR及其inspectPcmWav默认严格语义保持**，未知长度上传仍拒绝。只TTS已完整读回的响应可规范化；不把所有WAV检查改宽，不放宽8秒、并发2、12秒客户端或30秒/2MiB。
4. 正常EOF但无声明总长度的流，无法仅凭这些字段检测“恰好整帧提前结束”的语义截断，必须在报告如实说明，不声称修补后能证明整段朗读语义完整。原有可检测的网络/声明长度/格式截断均不能放过。

## 验收

- 用极小合成PCM字节复现双sentinel；单/多块流经真实adapter，未EOF不返回成功；正常EOF后规范头/PCM原样，输入不变，固定长度路径仍过。
- 每个豁免补坏头/混合sentinel/错误长度/奇帧/超时长/上限/stream.error/abort/Content-Length差异等负例，原严格inspect/ASR继续拒绝sentinel；默认未配置0网络保持。无大音频/磁盘文件/麦克风。
- focused/typecheck后向root预约一次完整verify C8C含实际build，scope/contracts0与准确报告，提交干净；作者无UI不重复browser。root新clone独验、更强负例、必要53浏览器及唯一持钥匙串的TTS→内存重采样→ASR真实回测；不以模拟200替代供应商证据。

全套verify/build/browser全项目串行，C6B有独占窗口时只做focused。root原5元预算尚有余量，只有root可执行已授权小样本真实联调，作者报告不得把未运行的真实验证写成通过。
