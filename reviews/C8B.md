# 验收记录：C8B DeepSeek语音适配

- 验收人：总设计师（独立验收对话）
- 分支与提交：task/C8B @ ab15183d6ad9839bb2c638c7474c57cbd08fdb3c
- 结论：通过（本地代码阶段；C8B-live仍未完成）

## 独立检查

新clone固定交付SHA，独立npm ci后试合main@c913f8d，生成最新Prisma客户端。没有复用作者node_modules或采信作者801测试输出。首次安装因Prisma尝试用户缓存目录受限，设置项目XDG_CACHE_HOME后重新完整npm ci成功；产品检查使用允许本机socket的执行权限。

| 项目 | 结果 |
| --- | --- |
| 类型/测试/真实构建 | 53文件887测试及verify内实际Next生产构建通过 |
| 范围 | 16文件合规 |
| 契约 | 分支差异0 |
| 报告 | reports/C8B.md存在，如实披露WAV子集、浏览器和真实服务限制 |
| 浏览器 | 33项全部通过，原27项与新增6项；375×667/1024×768原生codec流程 |
| 自编探针 | 手工构造100ms PCM16 WAV→实际handler/provider→真实FormData解析；approved-only报词、伪头拒绝、无key关闭、实际abort与迟到丢弃均通过 |

## 标准核对与生产代码

1. deepseek.ts固定官方ASR/TTS HTTPS路径、redirect:error、服务端Bearer；开关精确true且key非空才实例化。无自动收费重试，单适配器合计最多2个活跃调用，非合作超时占位不反复补发。缺凭据工厂与真实handler零网络通过。
2. ui/speech/wav.ts通过Web Audio解码，speech/wav.ts真正混音/重采样/PCM16编码，不是改MIME。新增浏览器以内存振荡器生成真实MediaStream，使用原生MediaRecorder和真实AudioContext，输出非零16k单声道WAV；手机和平板三种录入均通过。
3. 后端核对真实RIFF/fmt/data、位深/采样/长度/帧时长；不信客户端时长或MIME。ASR用FormData的file字段，返回duration_ms与真实帧时长对应，无拼音则[]。坏格式、超限、失败/慢body、忙/取消均有正常文字退路。
4. TTS只能由approved卡dictationContext触发，任意text请求400；完整有界读取、MIME/结构/长度校验后才播放。原approved URL优先和原生media error退路浏览器回归通过。
5. 转码与上传共用12秒客户端预算，服务8秒；编辑/提交/换屏/重录取消旧代次。原AudioContext、轨道、元素、BlobURL清理保持，迟到结果不覆盖文字。新增三类录入确认前不写学习命令/复述/素材，双击确认只提交一次，长作文仍手写且不被覆盖。
6. privacy集成测试在真实本地HTTP与全部迁移Prisma表前后对账，媒体/key不落库；静态客户端脚本、console、异常正文不含服务端key。root补充探针再次走实际handler确认权限来源和取消，不依赖测试版转码。

以上覆盖正式任务验收1–9；第10项按任务明确保留真实供应商联调，不把本地代码验收扩大为真实服务验收。

## 必须修改

无。

## 后续边界

- 只支持报告列明的44字节规范PCM16单声道WAV。未知长度流头、额外chunk等合法变体当前保守拒绝；真实DeepSeek TTS头结构未验证，必须先合成材料联调再决定扩展解析。
- 当前浏览器实测Chromium内存音轨，未测物理麦克风、Safari/Firefox或移动硬件；识别准确率、真实取消和计费仍待key。
- 每进程/实例限流不替代多进程共享限流；取消不能承诺供应商停止计费。生产默认关闭，文字流程可独立完成。
