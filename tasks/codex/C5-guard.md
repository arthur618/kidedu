# C5 护栏

- 交给：Codex
- 批次：第二批，需要 D2 已合并到 `main`（已满足）
- 分支：`task/C5`
- 允许修改的路径：`src/guard/`

开工前先读：`AGENTS.md`（尤其是“产品上的红线”）、`docs/ARCHITECTURE.md`、`src/contracts/schemas.ts` 里的 `GuardInput`、`GuardOutput`、`src/llm/README.md`。

## 目标

每条要给孩子看的模型输出，先经过护栏。护栏分两层：先用代码规则判断，规则拿不准的再问模型。输出是“通过”或“拦下加原因”。

护栏要防的四件事，按严重程度排：

1. **不安全**：不适合孩子的内容。
2. **代写**：替孩子写出可以直接抄进作文或作业的句子。
3. **泄露答案**：读后提问时把答案说出来了。
4. **现编知识**：讲字的时候没有引用字卡。

## 按顺序做

### 第 1 步：规则层

`src/guard/rules.ts` 导出 `checkRules(input: GuardInput, extra): RuleResult`。

`extra` 是规则需要的额外信息：`{ usedCardFields?: string[]; childLastUtterance?: string; keyPoints?: string[] }`。

`RuleResult` 有三种：`{ verdict: "pass" }`、`{ verdict: "blocked", reason }`、`{ verdict: "unsure" }`。

规则按下面的顺序检查，命中第一条就返回：

| 顺序 | 条件 | 结果 |
| --- | --- | --- |
| 1 | `candidate` 包含敏感词表里的词 | blocked，`unsafe` |
| 2 | `candidate` 去掉空白后超过 140 个字，或句子数超过 3 | blocked，`too_long` |
| 3 | `context` 是 `char`，且 `agent` 是 `char_coach`，且 `usedCardFields` 为空或没传 | blocked，`no_card_reference` |
| 4 | `context` 是 `essay`，且包含这些说法之一：“你可以写”“可以这样写”“比如写”“开头可以”“结尾可以”“好词”“好句” | blocked，`ghostwriting` |
| 5 | `context` 是 `essay`，且存在一个句子同时满足：长度超过 12 个字；不以“？”或“吗”“呢”加标点结尾；不是 `childLastUtterance` 的子串 | unsure |
| 6 | `context` 是 `reading`，且 `candidate` 包含任意一条 `keyPoints` 里连续 6 个字以上的片段 | blocked，`answer_leak` |
| 7 | `context` 是 `reading`，且存在长度超过 20 个字的陈述句 | unsure |
| 8 | 其他 | pass |

说明：

- 句子按“。！？!?”切分。引号里的内容（“”或‘’之间）如果是 `childLastUtterance` 的子串，算作引用孩子的话，检查第 5 条时先连同引号一起去掉。
- 敏感词表放 `src/guard/wordlist.ts`，先放一个 30 个词以内的基础表（暴力、色情、自伤、脏话几类各几个），并在文件顶部注释说明这只是起步，需要负责人补充。

### 第 2 步：模型层

`src/guard/model.ts` 导出 `checkWithModel(input, extra, deps: { llm }): Promise<GuardOutput>`。只在规则层返回 `unsure` 时调用。

- 用 `LlmClient` 调 `guard` 这个 Agent，输出结构是一个只含 `verdict` 和 `reason` 的小 schema。
- `system` 是常量，内容要点：
  - 你是一个审查员，判断一句话能不能说给一个正在写作文或读故事的小学生听。
  - 写作文场景：如果这句话是孩子可以直接抄进作文里的内容（描写、叙述、开头、结尾、比喻），判 blocked，原因 ghostwriting。提问、复述孩子的原话、说“我看见了某某”这类读者反应，判 pass。
  - 阅读场景：如果这句话说出了问题的答案或者明显提示了答案，判 blocked，原因 answer_leak。追问、请孩子找依据，判 pass。
  - 各给三个 pass 的例子和三个 blocked 的例子。
- 模型调用失败（`ok: false`）时，返回 blocked，原因取该场景最可能的那个（essay 是 ghostwriting，reading 是 answer_leak）。拿不准就拦，不放行。

### 第 3 步：合起来

`src/guard/index.ts` 导出 `guard(input, extra, deps): Promise<GuardOutput>`：

1. 调 `checkRules`。
2. pass：返回 `{ verdict: "pass", reason: "none", layer: "rule" }`。
3. blocked：返回对应原因，`layer: "rule"`。
4. unsure：调 `checkWithModel`，返回它的结果，`layer: "model"`。

再导出 `withGuard(run, fallback, opts)`：包住一个 Agent 的调用。流程是调 Agent、过护栏；被拦就再调一次 Agent（最多一次）、再过护栏；还被拦就返回 `fallback()`。返回值里带上最终的护栏结论和是否用了兜底，方便调用方记 `Turn` 和 `Incident`。

### 第 4 步：写说明

`src/guard/README.md`：两层各管什么、每条规则的一个例子、怎么加敏感词、怎么加规则。

## 验收标准

每条至少一个测试。模型层用假的 `LlmClient`。

1. 规则表的每一条各有一个命中和一个不命中的测试，测试名带规则序号。
2. 同时满足第 4 条和第 5 条条件的输入，结果是 blocked、`ghostwriting`、`layer` 为 rule（先命中第 4 条）。
3. 作文场景下这三句话通过，且不调用模型：
   - “你一进门最先看到的是什么？”
   - “鸭子船是什么样的？你坐了吗？”
   - “你说‘湖上有鸭子船’，我一下就看见了。”（`childLastUtterance` 是“有一个很大的湖，湖上有鸭子船”）
4. 作文场景下这三句话被拦或送模型层，不能直接通过：
   - “你可以写：公园里的湖像一面大镜子。”（规则层直接拦）
   - “开头可以先写天气。”（规则层直接拦）
   - “阳光洒在湖面上，金光闪闪的，美丽极了。”（送模型层）
5. 阅读场景：参考要点是“去叫大人来不及，人在水里等不了”，候选输出是“因为去叫大人来不及呀”，规则层拦下，原因 `answer_leak`。
6. 讲字场景：`usedCardFields` 为空时拦下；有内容时通过。
7. 规则层 pass 或 blocked 时，`llm.call` 没有被调用（断言调用次数为 0）。
8. 模型层调用失败时结果是 blocked。
9. `withGuard`：第一次被拦、第二次通过，Agent 被调两次，返回第二次的输出。
10. `withGuard`：两次都被拦，返回兜底输出，并标明用了兜底。
11. `withGuard`：第一次就通过，Agent 只被调一次。
12. `bash scripts/verify.sh C5` 通过。

## 不要做

- 不改任何 Agent 的代码（`src/agents/` 不是你的范围）。
- 不把护栏接进接口，那是之后集成的事。你只交可以被调用的函数。
- 不为了让测试通过而放宽规则。某条验收标准和规则表矛盾时，停下来写进报告。
- 测试里的例句全部自己编，不要用真实孩子的话。
