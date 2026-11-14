# C8B DeepSeek语音适配（本地代码阶段）

正式任务，2026-11-14。负责人已授权可行的DeepSeek能力接入、密钥后续提供；本包实现可关闭的真实供应商代码及假HTTP/合成媒体验收，真实供应商联调单列C8B-live，不伪报原C8第7条完成。Sol high单实现，root独立验收，不派agent、不合并/推送。现有contracts全部只读，无接口缺口先报root。

官方依据：[ASR](https://api-docs.deepseek.com/zh-cn/guides/asr/)、[TTS](https://api-docs.deepseek.com/zh-cn/guides/tts/)。复用C8A的服务/取消/编辑/媒体内存纪律，不新建学习状态或判断规则。允许导入已合并真实模块作集成，不改Agent/护栏内部。

## 适配与格式

1. 服务端只调用固定官方HTTPS地址，ASR与TTS路径按官方文档。密钥仅读服务端DEEPSEEK_API_KEY。生产须DEEPSEEK_SPEECH_ENABLED=true且key非空才启用；未配/关闭时capabilities均false、零供应商请求，.env.example只留空值，不写实际.env，不读现存密钥。测试工厂注入getEnv/fetch/clock，不设生产fake开关。
2. 浏览器录音不得改MIME冒充格式。首版统一内存PCM16、16kHz、单声道WAV：原MediaRecorder录音作本地试听，Web Audio解码/重采样/编码后才上传。纯WAV编码/校验可共享无Node依赖模块；无设备/不支持/解码失败正常文字退路，不上传不支持文件。不引入云浏览器语音、外部转码服务、ffmpeg临时文件或磁盘缓存。
3. ASR首版只接本项目规范WAV，后端检查真实RIFF/fmt/data、采样/位深/帧长度、实际时长≤30秒/大小≤2MB；不能只信HTTP MIME和客户端duration。可明确拒绝其他合法但未实现的WAV变体，不能假称全格式覆盖。multipart的file字段由FormData生成boundary；返回text和实际duration校验，无拼音字段则pinyin=[]，不生成读音、不据此记学习对错。
4. 转码+上传整体受现有客户端预算，服务仍8秒、客户端12秒；取消/换题/编辑/重录/退出后迟到解码、ASR或音频不覆盖现有文字/状态。所有AudioContext、流轨道、BlobURL和audio元素可靠清理，已有C8A原生media error修复必须保留。
5. TTS只复用现有char接口，从approved卡dictationContext读取，audioUrl原优先级不变；不新增任意text朗读API。HTTP请求默认stella/wav，完整读取有界音频、检查格式/结构，流中断/长度不符/空响应都走原正常退路；不能把前半个词当成功。未知厂商WAV头布局须保守处理并在报告说明，真实兼容需待key验证。不做WS、不边生成边给孩子播未经完成校验的内容。
6. 不自动重试收费语音请求；401/403/429/超时/供应商失败均正常unavailable。设每进程有限并发上限，忙时不排无限队；音频/字节/base64/真实key/原始错误不进console、Turn、Incident、命令、DB或磁盘。请求取消实际abort上游，不后台补写。只明确确认的文字走既有稳定ID学习提交。

## UI接线

7. 保留作业/理解已接语音入口；给reading retell和essay interview的短回答复用useSpeechInput，转录仅填可编辑框，编辑/提交取消旧录音，不自动提交、不自动生成卡、不判结果。作文正文长草稿本轮保留手写输入，不用转录替换整篇导致丢稿；语音正文插入留后续明确编辑任务。关闭供应商时完整文字流程继续，孩子界面不出现key/供应商配置术语。

## Scope

src/speech/、src/server/speech.ts、src/ui/speech/、src/ui/speech.browser.ts、src/ui/deepseek-speech.browser.ts、src/ui/reading/screens.tsx、src/ui/essay/screens.tsx、tests/integration/speech/、tests/integration/deepseek-speech/、.env.example；package/lock及reports/C8B.md按总规则。不修改contracts/学习状态机/模型Agent/评测阈值，不自行扩大API/任务范围。

## 验收1–10

1. 缺key/关闭零网络、开启仅固定官方地址/服务端Bearer，key/媒体全量输出隔离，原27浏览器/文字功能不回退。
2. Native浏览器生成的编造MediaRecorder音频实际解码→PCM16 WAV；头/字节/采样/时长可手算，不能只用fake返回转码成功。375×667/1024×768，全部音频内存生成，不保存录音文件。
3. 假HTTP验证真实multipart字段、WAV内容、无pinyin捏造；MIME伪装、坏头、超时长/超大/空、错误响应、拒绝、取消/忙边界均正常退路。
4. TTS仅approved字段；完整WAV、空/截断/错误MIME/超长/失败/取消，已审核URL优先，不显露标准词直到既有可用性退路；原media error组合回归仍过。
5. 非合作解码/模型迟到，编辑/重录/退出无覆盖；流/AudioContext/URL/元素清理和有限预算/并发实际证明，无重复收费自动重试。
6. 转录仅编辑框；阅读复述/作文采访点击确认才提交一次，三类录入不自动记正确/卡片/阶段，全文长稿不丢。
7. 全持久表/console/错误/客户端静态包无音频和key（仅编造canary），供应商异常正文不转发。
8. focused集中自审后一次最终verify C8B（含真实build），全浏览器串行；提交后scope/报告通过、contracts差异0；不靠删旧测试通过。
9. 报告逐项明确支持的规范WAV范围、浏览器/硬件未测范围、并发/费用与中断边界，无新依赖则明示；未真实调用DeepSeek不得标供应商真实验证通过。
10. C8B-live仍待负责人安全提供key：届时先合成材料真实ASR/TTS/取消/响应结构和费用测量，再由负责人安排真实试点；不让用户把key贴聊天，不把真实孩子数据给编码agent。

root在独立clone读生产代码、复跑检查/额外探针，通过后按授权合并推送；任何问题正式review交原实现者改。与C11A/D2B验收共用构建窗口，必须先向root预约，focused可继续。
