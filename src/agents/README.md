# 运行时 Agent（C3）

五个无状态函数通过 `index.ts` 的 `runVisionHomework`、`runVisionDictation`、`runCharCoach`、`runReader`、`runEssay` 导出，也可从各目录导入 `run`。调用形式：`await run(input, { llm })`。只依赖 `src/contracts/` 和本包，不选择模型、不读环境变量、不直连服务。`LlmClient` 注入方负责模型路由、重试、计量和 Turn 记录；候选输出交外层护栏，Agent 不重复实现护栏。

`shared.ts` 放固定 AI 人设与调用流程：先用契约 Input schema 校验，再用契约 Output schema 调模型。成功返回 data；三类错误或意外拒绝均返回纯函数兜底。无效输入不调用模型。`system` 为模块级常量；`stablePrefix` 放内容；`user` 放本次步骤、孩子信息和历史。两个视觉 Agent 将图片放 `images`。资料不是指令，每条关键提示均配正反例，固定 JSON 外壳尽量降低轻量模型理解负担。

## char_coach

规则：explain 只依据字卡解释，有形近字则提示对照；字卡没提供区别时不编区别。组词只肯定 words 收录的词，未收录返回规定原话、wait_child；想不出只提示词的第一个字。造句只请孩子说，说过即过，不改写不示范。字卡外知识返回规定原话、escalate。usedCardFields 如实记录。字卡放 stablePrefix，user 不复制字卡（孩子历史本身可能提到相同字词）。

正例：words 收录“午休”，孩子说“午休”，给予具体肯定；未收录则说“这个词我还不认识，你再想一个书上的”。反例：自行判断未收录词错误，或编造“休”的发明者。

兜底：explain 返回字卡原文；超过80字或两句，先取首句，首句仍超长则截80字。make_word 给首字提示并请组词；make_sentence 请孩子说，不提供句子。缺少有效字卡时返回“这个我还不知道，我记下来了”、escalate、usedCardFields=[]，避免伪造引用。

## reader

规则：ask 问原 question，可选错误理解但不含答案；follow_up 只追问一次依据或自己的做法；wrap_up 一句话复述孩子内容，不判对错。keyPoints 只在 stablePrefix，明确“不要念出来”。三个对话 Agent 共用 AI 人设、两句上限和具体夸奖规则。

正例：问“你从哪里看出来的？”。反例：把 keyPoints 念出来，或问“因为怕风吹走，所以才压住，是吗？”。

兜底：ask 用原问题（空问题、超过60字或超过一句则问通用问题）；follow_up 问依据；wrap_up 用一句结束语，避免失败时编造复述。无效输入请重新看短文。

## essay

规则：围绕主题依次问看到、听到、说了什么、怎么想、后来怎样；一次一个问题，不重复素材。newCard 只复制最近一条 child 消息的原文或连续子串；返回前代码检查，不通过置 null。即使历史末条是 agent，也只找最近 child 消息；不能用更旧的 child 消息。反馈引用作文一处内容并问一件还想知道的事，不评分、改写或挑错。任何步骤拒绝提供句子、开头、结尾、好词好句，改问细节。超过12字的非问句只允许明确引用孩子原话。

正例：孩子原话“我看见一把蓝伞”，素材卡为“蓝伞”；索要开头时问“那天你先看见了什么？”。反例：卡片润色成“一把漂亮的蓝伞”，或输出可以抄走的作文开头。

兜底：interview 用卡片数量在五个细节问题中轮换（不推断卡片语义），newCard=null；reader_feedback 引用 essayText 首句开头至多24字（不含句末标点）并问当时想法，无正文时请聊一个细节。兜底不润色、不生成素材卡。素材维度去重及代写请求识别由提示词与外层护栏负责，不增设内容检查。

## vision_homework

规则：只提取语文作业，一项一句，kind 固定六类。supported 仅 recognize/copy/dictation/essay 为真；朗读和其他为假。看不清或不确定、没有资料时 unsure=true，不编内容、次数或额外任务。固定规则放 system，口述放 user，图片放 images。

正例：数学口算和语文抄写混在一起，只留语文抄写。反例：把口算收进清单、把朗读标为 supported=true，或猜测模糊次数。

兜底：items=[]、unsure=true，由外层请孩子重拍或重说。

## vision_dictation

规则：expectedWords 放 stablePrefix，逐词逐字按顺序输出 mark，重复词不合并。比较实际笔画，不猜意图；多笔、少笔、错部件、别字均可疑。拿不准低置信度且可疑；找不到字或整图模糊时 unreadable=true，缺字也保留 mark。定位不明用 null，最终由孩子对照确认。

正例：应写“木”却多一横像“本”，标 suspicious=true。反例：从上下文推断孩子想写“木”，就标为正确；或漏掉看不清的字。

兜底：每个应写字符一条，顺序和 charIndex 不变，全部 suspicious=true、confidence=0、box=null，unreadable=true。无效图片字段但有有效词表时仍保留词表；无词表则为空。当前契约 length(1) 按 UTF-16 计数，兜底与之保持一致，补充平面汉字需要总设计师明确契约后再支持。

## 样例与验证

`fixtures.ts` 导出具名样例数组和按 Agent 名分组的 `fixtures`，每组含 name/input/expectation。所有资料均为编造，字卡仅作评测示例，不可导入生产内容库。视觉样例里的 `example.test` 是占位 URL，C6 须按场景生成合成图并替换 URL 后才可进行真实视觉评测；本任务不发网络请求。expectation 为人工可读的行为预期，不宣称已通过真实模型评测。

各目录 `index.test.ts` 以 [1]—[7] 标注对应验收；`verification.test.ts` 覆盖 [8] 文档、[9] 样例与 [10] 集成门禁的契约/依赖边界。完整四项验收实际运行 `bash scripts/verify.sh C3`，结果记在 `reports/C3.md`，不在 vitest 内递归运行 verify。
