# 任务报告：C8C 真实TTS流式WAV文件头兼容

- 实现者：Codex（Sol，medium；单agent）
- 分支：task/C8C
- 自查结果：focused/typecheck已执行，完整verify待串行窗口及C6B主线合入后填写。

## 做了什么

在TTS原readSpeechBody完整有界读取成功后调用小型纯函数，仅成对0xFFFFFFFF长度复制规范化，随后复用原inspectPcmWav严格核验。规范长度路径继续兼容；ASR与默认inspect不变。没有修改配置、依赖、上限、并发、超时或UI。

## 验收标准对照

| 验收标准 | 测试 | 状态 |
| --- | --- | --- |
| 合成单/多块双sentinel直到EOF成功，PCM原样，输入不变，固定长度兼容 | stream-wav.test.ts：双sentinel分1/3块直到EOF才成功；wav.test.ts：完成的TTS双sentinel复制规范化（含非零byteOffset视图） | focused通过 |
| 坏头、混合sentinel、其他未知值、奇帧、空、超时长、超大小拒绝 | stream-wav.test.ts：双sentinel不豁免坏头等；保留所有原wav严格负例 | focused通过 |
| stream.error、取消、8秒超时、Content-Length差异拒绝 | stream-wav.test.ts：流错误和Content-Length不符；双sentinel已收到但未EOF时abort/timeout | focused通过 |
| ASR/默认inspect继续拒绝sentinel，默认未配置零网络 | stream-wav.test.ts：ASR双sentinel上传仍拒绝；wav.test.ts严格检查；原provider测试 | focused通过 |
| 全套verify含真实build、scope与contracts 0 | 待预约串行窗口 | 待运行 |

## 改动的文件

- src/speech/wav.ts
- src/speech/deepseek.ts
- src/speech/wav.test.ts
- tests/integration/deepseek-speech/stream-wav.test.ts
- src/server/README.md
- reports/C8C.md

## 新增依赖

无。干净npm ci --offline --cache /private/tmp/yuwen-review-npm-cache成功，审计0漏洞。

## 契约问题

无，contracts修改0。

## 没做的和已知问题

正常EOF但无声明总长度的流，不能检测恰好整帧提前结束的语义截断；规范化不证明整段朗读完整。作者没有读取密钥、真实录音或发出真实模型请求；真实TTS→ASR、音质及硬件验收由root另行执行，本文不声称通过。初次focused含既有privacy测试受sandbox回环listen EPERM限制；经正常require_escalated审批重跑4文件25测试全部通过。typecheck通过。该限制不属于产品失败。

## 建议

无范围外修改。
