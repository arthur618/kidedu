# C4 内容生产流水线

- 交给：Codex
- 批次：第三批，需要 D2 已合并到 `main`
- 分支：`task/C4`
- 允许修改的路径：`scripts/content/`、`content/`

## 目标

做一套离线的命令行工具，把“一课的生字表和词语表”变成可以入库的字卡，把“一组目标字和一个主题”变成课外短文。流程是：模型起草，代码检查，另一家模型审校，人工终审。这一层不接触孩子数据，可以用 OpenAI 的模型。

## 要读的

- `src/contracts/schemas.ts`：`Lesson`、`CharCard`、`Passage`、`ReviewStatus`。
- `src/contracts/llm.ts`：`LlmClient`。
- D2 交付的 `src/llm/README.md`：怎么为离线任务构造一个不受“运行时只能用 DeepSeek”限制的客户端。

## 目录约定

```
content/
  lessons/<年级>-<册>-<课次>.json     输入：人工录入的一课（Lesson，status 为 draft）
  cards/<字>.json                     输出：CharCard
  passages/<编号>.json                输出：Passage
  known-chars/<年级>-<册>.txt         到某一课为止学过的全部字，每行一个
  review/<日期>.md                    给人看的审核清单
```

## 命令

| 命令 | 做什么 |
| --- | --- |
| `npm run content:cards -- <lesson 文件>` | 为这一课每个还没有字卡的字起草 `CharCard`，状态为 draft |
| `npm run content:passage -- --chars 休,森,采 --topic 足球 --known <known-chars 文件>` | 起草一篇短文，状态为 draft |
| `npm run content:check` | 对所有 draft 跑代码检查，输出问题清单 |
| `npm run content:review` | 让审校模型逐条挑错，结果写进各文件的 `_review` 字段，状态改为 reviewed |
| `npm run content:sheet` | 生成一份 `content/review/<日期>.md`，把所有 reviewed 的内容排成便于人逐条核对的清单 |
| `npm run content:approve -- <文件...>` | 人工确认后把状态改为 approved |

## 起草的要求

字卡：

- `pinyin` 带声调。`radical` 是部首。
- `explain` 两三句，讲这个字的构造和意思的关系，三年级孩子听得懂。说不清来历的字，只讲部件和意思，不编故事。
- `words` 三到五个常用词，优先用这一课词语表里的。
- `confusable` 零到三个形近字，必须是真实存在的常用字。
- `dictationContext` 的格式是“字，词语的字”，例如“休，休息的休”。
- `source` 留空，由人工填。起草的提示词里明确告诉模型：拿不准的内容宁可不写。

短文：

- 300–500 字，一个完整的小故事或一段有趣的说明，结尾可以留一个悬念。
- 每个目标字至少出现一次。
- 用字尽量限制在 known-chars 里，超纲字不超过全文不同汉字数的 3%。
- 不出现真实的人名、品牌、暴力、恐怖和说教。
- 附一个读后问题和三个参考要点。问题要问“为什么”或“你觉得”，不问能在文中直接抄到的事实。

## 代码检查（不用模型）

`content:check` 对每个 draft 检查并报告：

- 能否通过对应的 zod schema。
- 字卡：`char` 是单个汉字；`pinyin` 含声调符号；`words` 里每个词都包含这个字；`confusable` 不包含自己；`dictationContext` 里包含这个字和 `words` 中的一个词。
- 短文：字数在范围内；每个目标字都出现了；统计超纲字，写入 `outOfScopeCount`，并列出是哪些字；超过 3% 记为不合格。

## 审校

- 审校用和起草不同厂商的模型。起草默认 OpenAI，审校默认 DeepSeek，两者都在配置里可改。
- 审校模型的任务是挑错，不是改写：读音对不对，部首对不对，讲解有没有编造，形近字是否真实，词语是否适合三年级，短文有没有不适合孩子的内容。
- 输出每条内容的问题列表，没问题就是空列表。不让审校模型直接改内容。

## 验收标准

1. 六个命令都能运行；`--help` 有中文说明。
2. 用假的 `LlmClient` 的测试：`content:cards` 对一课生成的字卡数等于该课不重复的字数减去已有字卡数。
3. 代码检查的每一条规则有一个通过和一个不通过的测试。
4. 超纲字统计的测试：给定 known-chars 和一段文字，统计结果和手工数的一致，标点、数字、字母不计入。
5. 审校不修改正文字段，只写 `_review`（测试断言审校前后其他字段相同）。
6. `content:approve` 拒绝批准没有经过 check 和 review 的文件，拒绝批准 `source` 为空的字卡（测试）。
7. 已经是 approved 的文件，任何命令都不会覆盖（测试）。
8. `content/` 下提供一课编造的示例输入（`content/lessons/demo.json`，用 6 个常见字），以及用假客户端跑出的示例输出，方便人看流程。
9. `scripts/content/README.md` 写清楚从录入一课到全部批准的完整操作步骤，一个不写代码的人能照着做。
10. `bash scripts/verify.sh C4` 通过。

## 不在范围内

- 不做报词音频合成（之后的任务）。`audioUrl` 一律为 `null`。
- 不做入库。D1 提供导入已批准内容的脚本；本任务只产出文件。
- 不做网页版的审核界面，`content:sheet` 生成的清单文件就是审核界面。
- 示例内容不要抄课本原文。课文原文有版权，仓库里不放。
