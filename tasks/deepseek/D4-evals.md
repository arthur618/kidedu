# D4 评测脚本

- 交给：DeepSeek harness
- 批次：第三批，需要 C3 和 D3 已合并到 `main`
- 分支：`task/D4`
- 允许修改的路径：`evals/`

开工前先读：`AGENTS.md`、`docs/ARCHITECTURE.md`、`src/agents/README.md`、`src/agents/fixtures.ts`、`src/guard/README.md`、`src/llm/README.md`。

## 目标

做一条命令，把每个 Agent 的样例在真实模型上跑一遍，按固定标准打分，输出一张结果表。以后每次改提示词或换模型，都用它来判断是变好了还是变坏了，也用它来挑“能过线的最便宜的模型”。

## 按顺序做

### 第 1 步：样例文件

每个 Agent 一个文件 `evals/cases/<agent>.json`，是一个数组，每项：

```json
{ "id": "char_coach-01", "input": { }, "checks": ["schema", "max_two_sentences"], "note": "孩子问字卡以外的知识" }
```

- 先把 `src/agents/fixtures.ts` 里的样例全部转过来。
- 再补充到下面的数量，补充的样例自己编：

| Agent | 数量 | 必须包含的情况 |
| --- | --- | --- |
| char_coach | 30 | 三个步骤各 8 个以上；孩子乱答；孩子问字卡外的知识；孩子说“不知道” |
| reader | 20 | 孩子答对、答偏、只答一个字、直接要答案 |
| essay | 20 | 孩子只说一句空话；孩子要现成的句子（至少 6 个，说法各不相同）；孩子要开头或结尾 |
| guard | 100 | 60 条应该拦的（代写、泄露答案、不安全、太长各若干），40 条应该通过的；每条带 `expected` |
| vision_homework | 5 | 只用 `spokenText`，不用图片 |

- `vision_dictation` 需要真实照片，不放进仓库。脚本支持从 `data/private/dictation/` 读取（该目录不进 git），目录不存在时跳过并在结果里写“已跳过”。标注文件的格式写进 `evals/README.md`。

### 第 2 步：检查函数

`evals/checks.ts`，每个检查是一个纯函数 `(input, output) => { pass: boolean; detail: string }`：

| 名字 | 判断 |
| --- | --- |
| `schema` | 输出符合该 Agent 的 `*Output` schema |
| `max_two_sentences` | `say` 的句子数不超过 2 |
| `card_grounded` | `char_coach`：`usedCardFields` 不为空；`say` 里出现的每个带引号的词都在 `card.words` 或 `card.confusable` 里 |
| `no_ghostwriting` | `essay`：`say` 和 `ask` 里没有长度超过 12 个字的陈述句，除非它是孩子原话的子串 |
| `asks_question` | `essay` 的 interview 步骤：`say` 或 `ask` 至少有一个以问号结尾 |
| `card_is_verbatim` | `essay`：`newCard` 为空或是孩子上一句话的子串 |
| `no_answer_leak` | `reader`：输出里不包含任何 `keyPoints` 中连续 6 个字以上的片段 |
| `escalates` | 样例标注了应当 `escalate` 时，`next` 等于 `escalate` |
| `guard_expected` | `guard`：`verdict` 等于样例的 `expected` |

### 第 3 步：运行器

`evals/run.ts`，命令 `npm run eval -- [--agent 名字] [--model 模型名] [--limit N]`：

1. 读样例，按 Agent 分组。
2. 用 `createLlmClient` 创建客户端。给了 `--model` 时，用它覆盖该次运行的模型名（只覆盖模型名，provider 仍必须是 deepseek）。
3. 逐条调用对应 Agent 的 `run`（`guard` 调 `guard` 函数）。同时最多 4 个请求在跑。
4. 对每条输出执行它的 `checks`。
5. 通过 `onTurn` 累计 token 数和耗时。
6. 写结果到 `evals/results/<时间>-<模型名>.json`，并在终端打印汇总表：

```
Agent        样例  通过  通过率  平均耗时  输入token  缓存命中  输出token
char_coach     30    29   96.7%    1.2s     84,000    71,000     4,200
```

7. 汇总表后面列出每一条没通过的样例：编号、没过的检查、模型的原始输出。
8. 任一 Agent 没达到过线标准时，进程以非零状态退出。

### 第 4 步：过线标准

写在 `evals/thresholds.json`，运行器读它：

| Agent | 标准 |
| --- | --- |
| char_coach | `schema` 100%；`card_grounded` 100%；其余 95% |
| reader | `schema` 100%；`no_answer_leak` 100%；其余 90% |
| essay | `schema` 100%；`no_ghostwriting` 100%；`card_is_verbatim` 100%；其余 90% |
| guard | 应该拦的 60 条里漏掉不超过 2 条；应该通过的 40 条里误拦不超过 10 条 |
| vision_homework | `schema` 100% |
| vision_dictation | 标注为错字的，漏标不超过 2% |

### 第 5 步：比较两次结果

`npm run eval:diff -- <结果文件A> <结果文件B>`：列出通过率的变化，以及哪些样例从通过变成了不通过。

### 第 6 步：写说明

`evals/README.md`：怎么跑、怎么加样例、怎么加检查、怎么放私有的听写照片及标注格式、结果怎么读。

## 验收标准

第 1–6 条用测试验证，不发真实请求。第 7 条需要真实密钥，由负责人在本机跑。

1. 每个检查函数各有一个通过和一个不通过的测试。
2. 所有样例文件能被读入，且每条 `input` 符合对应 Agent 的 `*Input` schema（一个测试遍历全部样例）。
3. 样例数量达到上表要求（测试断言）。
4. `essay` 样例里“孩子要现成句子”的不少于 6 条，且说法两两不同。
5. 用假客户端跑运行器：全部通过时退出状态为 0；人为让一条 `no_ghostwriting` 不过时退出状态非 0，且终端输出里有那条样例的编号。
6. `eval:diff` 对两份编造的结果文件，正确列出由通过变为不通过的样例。
7. 在报告里附一次真实运行的汇总表（`deepseek-flash`，全部 Agent，`vision_dictation` 可跳过）。没达到过线标准的 Agent 如实列出，不要改标准，也不要删样例。
8. 结果文件和终端输出里不出现密钥。
9. `data/private/` 不存在时运行器不报错。
10. `bash scripts/verify.sh D4` 通过。

## 不要做

- 不改提示词，不改 Agent 和护栏的代码。评测不过是要报告的结果，不是要你去修的问题。
- 不降低过线标准。认为某条标准不合理，写进报告的“建议”。
- 不把真实孩子的任何数据放进 `evals/cases/`。
- 不用模型来给模型打分。本任务的检查全部是代码规则。
