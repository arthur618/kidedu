# C3 各 Agent 的提示词与函数

- 交给：Codex
- 批次：第二批，需要 D2 已合并到 `main`（已满足）
- 分支：`task/C3`
- 允许修改的路径：`src/agents/`

## 目标

为五个运行时 Agent 写提示词和调用函数：`vision_homework`、`vision_dictation`、`char_coach`、`reader`、`essay`。每个 Agent 是一个无状态函数，输入输出结构已在契约里定好。

这些 Agent 实际跑在 DeepSeek 的轻量模型上。提示词要写得让一个不太强的模型也能稳定遵守规则：规则短、明确、有正反例，输出格式固定。

## 要读的

- `src/contracts/schemas.ts`：每个 Agent 的 `*Input` 和 `*Output`。
- `src/contracts/llm.ts`：`LlmClient`、`LlmRequest`。`system` 放固定规则，`stablePrefix` 放当课内容，`user` 放可变部分。
- `AGENTS.md` 的“产品上的红线”。

## 交付物

每个 Agent 一个目录 `src/agents/<名字>/`：

| 文件 | 内容 |
| --- | --- |
| `prompt.ts` | 导出 `system` 字符串，以及 `buildStablePrefix(input)`、`buildUser(input)` |
| `index.ts` | 导出 `run(input, deps: { llm: LlmClient }): Promise<Output>` |
| `fallback.ts` | 模型失败时的兜底输出，纯函数，从输入直接构造 |
| `index.test.ts` | 测试，用假的 `LlmClient` |

另有 `src/agents/index.ts` 统一导出，和 `src/agents/README.md` 说明每个 Agent 的提示词设计思路。

## 各 Agent 的行为

**小问号的人设**（`char_coach`、`reader`、`essay` 共用，写成一段共享的文字）：一个爱提问的小机器人。说话短，一次最多两句，用三年级孩子听得懂的词。它是学习道具，明确是 AI，不扮演朋友或家人，不说“我想你”“你真聪明”，不聊学习以外的私事。夸奖只夸具体的事。

**char_coach 认字教练**

- `explain`：用 `card.explain` 的内容讲这个字为什么这么写，有形近字时点出区别。只能用字卡里的内容，换成孩子听得懂的说法可以，加新知识不行。`usedCardFields` 如实填写用到的字段，不能为空。
- `make_word`：请孩子用这个字组一个词。孩子组的词在 `card.words` 里就肯定；不在里面时不判对错，说“这个词我还不认识，你再想一个书上的”，并把 `next` 设为 `wait_child`。孩子说不出时给 `card.words` 里一个词的第一个字作提示。
- `make_sentence`：请孩子用一个词说一句话。孩子说了就过，不改孩子的句子，不给示范句。
- 孩子问字卡以外的知识（“这个字是谁发明的”）：回答“这个我还不知道，我记下来了”，`next` 为 `escalate`。

**reader 阅读伙伴**

- `ask`：把 `passage.question` 用小问号的口气问出来，可以带一个故意的错误理解，引孩子来纠正。
- `follow_up`：根据孩子的回答追问一次，方向是“你从哪里看出来的”或“换了你会怎么做”。`keyPoints` 只用来判断往哪个方向追问，不能念出来，不能透露答案。
- `wrap_up`：用自己的话复述孩子讲的内容，一句话，不评价对错。

**essay 作文采访**

- `interview`：围绕 `topic` 追问细节，一次只问一个问题。按看到的、听到的、说了什么、当时怎么想、后来怎样的顺序轮换，不重复已有素材卡里的内容。孩子上一句话里有具体内容时，把那句话原样放进 `newCard`，必须是孩子原话或其连续的一部分，一个字都不改。
- `reader_feedback`：读 `essayText`，只说两件事：哪一处“我看见了”（引用孩子写的一处具体内容），哪一处“我还想知道”（问一个问题）。不评分，不改写，不指出错别字。
- 任何步骤下，孩子索要句子、开头、结尾、好词好句（“帮我写”“这句怎么写”“给我一个开头”），都不给，回一个问题。
- 输出的 `say` 和 `ask` 里不能出现可以直接抄进作文的陈述句。判断标准：超过 12 个字、不以问号结尾、不是在引用孩子原话的句子，一律不写。

**vision_homework 识别作业清单**

- 从照片或孩子说的话里提取作业项，每项一句孩子看得懂的话。
- `kind` 分类：认读、抄写、听写、朗读、作文、其他。`supported` 为真的只有 recognize、copy、dictation、essay。
- 只提取语文作业。看不清或不确定时 `unsure` 为真，不编造。

**vision_dictation 听写对照**

- 输入照片和应写的词表。对每个应写的字输出一条 `DictationMark`。
- 你的任务不是认出“孩子想写什么字”，而是逐笔比较“孩子实际写出来的形状”和标准字是否一致。多一笔、少一笔、部件写错、写成了别的字，`suspicious` 都为真。
- 拿不准时 `suspicious` 为真、`confidence` 低。漏标错字比多标严重得多。
- 照片里找不到对应的字，或整张看不清，`unreadable` 为真。

## 实现要求

- `run` 的流程：用 `*Input` schema 校验输入，构造请求，调 `llm.call`，成功则返回 `data`，失败则返回 `fallback(input)`。不抛异常。
- 兜底输出也要符合 `*Output` schema。例如 `char_coach` 的 `explain` 兜底是直接返回 `card.explain` 原文（超长则截到第一个句号）。`vision_dictation` 的兜底是全部标为 `suspicious: true`、`confidence: 0`，让孩子全部自己对照。
- `system` 是常量字符串，不含任何随输入变化的内容，这样才能命中缓存。
- 提示词里给每条关键规则配一个正例和一个反例。
- 不在 `src/agents/` 里引用任何厂商 SDK，不读环境变量。

## 验收标准

1. 五个 Agent 都有 `run`，输入不合 schema 时返回兜底输出而不是抛异常（各一个测试）。
2. 假的 `LlmClient` 返回 `ok: false` 的三种错误时，每个 Agent 都返回符合 schema 的兜底输出（各一个测试）。
3. 每个 Agent 的 `system` 是模块级常量；测试断言两次不同输入构造出的 `system` 完全相同。
4. `char_coach` 的 `buildStablePrefix` 包含字卡的 explain、words、confusable；`buildUser` 不包含字卡内容（测试断言）。
5. `reader` 构造的请求里，`keyPoints` 只出现在 `stablePrefix` 中并带有“不要念出来”的说明；测试断言 `user` 里没有 `keyPoints` 的文字。
6. `essay` 的 `run` 在返回前做一次代码检查：`newCard` 不为空时必须是孩子上一句话的子串，否则置为 `null`（测试覆盖：是子串、不是子串、历史为空）。
7. `vision_dictation` 的兜底输出条数等于应写的字的总数，顺序和 `expectedWords` 一致（测试）。
8. `src/agents/README.md` 里每个 Agent 有一节，说明规则、正反例、兜底策略。
9. 提供 `src/agents/fixtures.ts`：每个 Agent 至少 6 组编造的输入样例，覆盖上面“各 Agent 的行为”里的每一种情况。C6 会用它做真实模型的评测。
10. `bash scripts/verify.sh C3` 通过。

## 不在范围内

- 不实现 `guard`、`score`、`report` 三个 Agent（C5 和后续任务）。
- 不调真实模型。提示词在真实模型上的效果由 C6 的评测来验证，评测不过会回到这个任务调整。
- 不在 Agent 里做护栏审查，那是 C5 的事。上面第 6 条的子串检查是唯一的例外，因为它是数据正确性，不是内容审查。
- 测试样例全部编造，不使用任何真实孩子的作业或作文。
