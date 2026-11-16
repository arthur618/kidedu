# DeepSeek搜索/语音真实阶段记录

2026-11-16，root持指定钥匙串凭据，原5元总授权内追加0.1元保守预留，累计上限0.776406元（非实际账单）。仅公开教材搜索1次、短合成文本TTS1次，生产开关未修改；音频仅内存，未用麦克风或孩子录音。

真实C4B搜索适配器返回200且ResearchArtifact status=reference_only、结果1条，为人教社公开教材研究链接；搜索成功不使内容自动approved。

真实C8B TTS适配器调用返回200/audio-wav、正常读完99884字节，但返回null。头字段：RIFF/WAVE、fmtBytes16、PCM1、mono1、24kHz、16bit、data在36；RIFF与data声明长度都为4294967295。当前inspectPcmWav严格要求实际固定长度，所以不兼容该流式文件头；不是key/音色鉴权错误。

已冻结C8C限定双sentinel且完整有界EOF后的规范化，不更改ASR上传校验或上限。ASR本轮未发出，不记识别通过。语音硬件、Safari、质量/计费/取消综合验收仍未完成。原始metadata在root work/DeepSeek-tools-live.json，不含音频二进制或密钥。

## C8C后真实链路

C8C独立1084测试/实际构建通过。第二轮不重复搜索，只TTS→内存16k重采样→ASR，各1次HTTP200；WAV完整读取130604字节，规范化后24k mono PCM16、2720ms，ASR回“你好，这是语音测试。”。未知流头问题关闭，ASR仍严格拒绝未知头上传。累计保守预算账上限0.876406元，非实际账单；音频/key未落盘。详情reviews/C8C.md与docs/audits/tools-20261116.json。不将单个合成样本算真实孩子识别质量或硬件通过。
