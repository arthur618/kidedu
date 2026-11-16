# DeepSeek接入评估与裁决

2026-11-14，负责人授权核实后集成，密钥稍后提供。依据当天官方文档及当前main代码；实际运行时请求未发出，不含真实凭据/孩子数据。

| 能力 | 官方接口/指南 | 本项目裁决 |
| --- | --- | --- |
| 对话/图像 | [对话协议](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/)、[图像](https://api-docs.deepseek.com/zh-cn/guides/vision/) | 已有LlmClient与图像块；D2B补显式预算、非思考默认、审核和完成/拒答检查，不重建SDK |
| 语音识别 | [ASR指南](https://api-docs.deepseek.com/zh-cn/guides/asr/) | C8B选择DeepSeek。完整上传PCM16 WAV或Ogg Opus；本项目统一内存PCM16 WAV，返回可编辑文字，不自动判学习结果 |
| 语音合成 | [TTS指南](https://api-docs.deepseek.com/zh-cn/guides/tts/) | C8B用HTTP整段文本合成WAV，先只播approved字卡报词，继续内存播放；不做WS/边生成边播 |
| 搜索/抓取 | [独立搜索](https://api-docs.deepseek.com/zh-cn/api/search/)、[联网工具](https://api-docs.deepseek.com/zh-cn/guides/web_tools/) | 适合C4B离线公开资料检索/出处核对；内容仍需check/review/人工approve，不给孩子直接显示搜索结果，不发孩子原文/照片/录音 |
| OCR | [OCR接口](https://api-docs.deepseek.com/zh-cn/api/ocr/) | 技术可用，当前作业/听写已有图像模型；不重复接第二条OCR，不据OCR自动评分，后续作文拍照另冻契约 |
| 基础内容审核 | [官方安全指南](https://api-docs.deepseek.com/zh-cn/guides/safety/) | 作为额外检查，保留本项目护栏、来源限制与受信作文问题；完整返回后再展示 |

## 当前差距

- src/llm/internal.ts已发官方兼容请求，但无显式思考/输出量配置，且不检查finish_reason/refusal；D2B是有用的补齐。
- C8A生产ASR/TTS仍null。浏览器优先产生WebM或MP4，不能改MIME冒充官方支持的WAV。C8B须真正解码、重采样、PCM16编码到规范WAV，再发后端；失败保留文字。
- ASR不返回拼音，不补造pinyin，仍返回空数组；字词知识只来自审核卡。音频实际时长/编码要从内容验证，保持本项目30秒/2MB，不能因为上游限制较宽而放大。
- TTS音频可能中途截断，须完整读取、检查WAV结构/长度，错误不当成功。仅服务端持key、固定官方地址、请求取消/限流和上限，生产开关默认关闭；本机环境变量待负责人后续配置。
- 搜索优先独立可计量接口，不给孩子路由添加自主工具；无需长链搜索即可支持审校资料准备。

## 顺序与验证

D2B协议/预算为范围明确的小包，选Sol medium；C8B涉及浏览器音频转换/供应商适配/隐私与取消，选Sol high；C4B公开资料离线检索可Sol medium。C11A原工作保留继续，构建/浏览器串行排队，不同时跑整套。

代码验收与真实联调分开：先假fetch/编造音频/真实浏览器检查，再在负责人安全配置密钥后用合成材料实际调DeepSeek。后者未发生前不记“真实语音通过”，也不把API key贴到聊天或Git。

## 代码阶段结果（2026-11-15）

- D2B已合并c913f8d：[正式验收](../reviews/D2B.md)，显式有限预算/非思考/high审核和完整结束判断。
- C8B已合并aad4e27：[正式验收](../reviews/C8B.md)，真实浏览器内存WAV转换、固定ASR/TTS、可编辑短回答和approved报词。
- C4B已合并5bf3bbe：[正式验收](../reviews/C4B.md)，独立公开搜索、单请求/8秒/1MiB、reference_only文件及原有审批隔离。

上文“当前差距”是接入前背景。最新main948测试/构建通过，语音原生浏览器33项已独立验证；无真实DeepSeek请求、硬件或费用证据。DEEPSEEK_API_KEY、DEEPSEEK_SPEECH_ENABLED、DEEPSEEK_RESEARCH_ENABLED示例全空，语音/检索默认关闭。后续安全配置服务端key后，先合成材料核对模型可用性/拒答/usage、ASR时长与准确性、TTS实际WAV头/完整性、取消/延迟/收费，再考虑试点；不收集key到聊天或编码对话。

## 首次真实接口验证（2026-11-16）

D2C已修复真实HTTP400：DeepSeek使用text传输并保留high审核，仍要求JSON输出、由本地解析/Zod严格校验和有限纠正；OpenAI离线路由仍json_object。思考显式disabled与有限maxTokens保持，参考[思考模式](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/)和[Chat Completions](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/)。组合限制以真实服务错误确认为依据，不把它说成thinking冲突。

179条公开合成样本94次真实HTTP全部成功，不包括私有听写/真实照片；原质量阈值前三Agent未过，部分规则误报另待负责人裁决。C3B另修完整组词答案提前给出问题，独立/main1076测试与真实定向回测通过。完整证据及费用估算见reviews/C6-live.md；ASR/TTS、公开检索真实联调与孩子试用仍未发生，key未入仓库。

## 全册附件核对与工具实际验证

用户提供的81篇快照按相关API章节核对，摘要与附件hash见[API核对记录](DEEPSEEK-API-AUDIT.md)。C4B搜索真实200、reference_only；C8C修正未知长度流式WAV后，真实TTS→内存重采样→ASR200并识别回合成文本。音频/key未落盘，默认生产开关未修改；本轮没有孩子录音、OCR/Fetch调用或硬件质量验收。详细证据[工具实测](../reviews/TOOLS-live.md)。
