# C8C验收：通过

2026-11-16，task/C8C@b892b7ba2bf66685c54fa0ebc54a8b57f33ee710。root新clone独立安装，固定最终提交、读取全部生产差异，verify C8C：67文件1084测试、实际构建、scope6、contracts0通过（71.17秒）。原严格ASR/超时/大小/时长不改。

生产仅新增成对sentinel且完整有界读取后复制规范化两个长度字段，再复用原strictinspect。读入失败/取消/声明Content-Length差异仍在原readSpeechBody拒绝；不接受混合sentinel/坏格式/奇帧/超大小时长。独立offset-view/不改原buffer/严格ASR/延迟EOF/stream.error探针通过。

真实短合成TTS返回200，双FFFFFFFF头正常读完130604字节，规范化后24kHz/16bit/mono、2720ms；仅内存重采样16k后，ASR200，返回“你好，这是语音测试。”、pinyin空数组。未用麦克风/孩子录音，key与音频未落盘，未改生产开关。不能由一例推断孩子语音准确率。两轮工具联调各保守预留0.1元，累计预算账上限0.876406元（非实际账单），未触及5元。

浏览器首次53项中52通过，未改parent.browser一例在页面关闭时route.fetch报contextclosed；UI断言未见失败。原样单独家长8项全部通过15.1秒，保留两份日志，不宣称首次整套53绿。其余52本轮通过，包括媒体/恢复；无需重复全套。该fixture收尾波动另记录，不修改产品或测试断言遮盖。

作者首轮scope基线竞态后已修本clone main基线，第二次完整verify0；曾额外构建，报告如实记录，root不据重复次数提高结论。root构建/截图生成差异已另存patch后只还原确认路径。

必须修改：无。正常EOF、未知总长不能证明整段语义完整（整帧干净提前结束无法仅凭头检测），限制已记录。主线已与同批C6B共用一次最终干净组合复验：typecheck、68文件1157测试及实际构建通过91.78秒（文件workers=4），原超时/断言保持。证据root work/review-C8C-{verify,probe,browser,parent-browser-recheck}.log及DeepSeek-tools-post-C8C.json，无音频原文。
