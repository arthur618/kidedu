# C7 集成：把认字回路接通

- 交给：Codex
- 批次：第四批，需要 C1、D1、D2、C3、C5 全部已合并到 `main`
- 分支：`task/C7`
- 允许修改的路径：`src/server/`、`app/api/`、`src/orchestrator/reduce.ts`、`src/orchestrator/reduce.test.ts`、`tests/integration/`

## 目标

前面的任务包各自独立、互相只认契约。这个任务把它们接起来：服务端收到孩子端的事件后，跑编排器、执行效果、调 Agent、过护栏、记录、返回。做完后，用种子数据可以从“拍作业”一路走到“今天先到这”，每一步都真的经过各自的模块。

## 要读的

- `src/contracts/` 全部三个文件。
- `src/server/README.md`（D1）、`src/llm/README.md`（D2）、`src/agents/README.md`（C3）、`src/guard/README.md`（C5）。
- `reviews/C1.md` 第二次验收里“可以之后再改”的第一条。

## 要做的事

### 1. 接上编排器

`src/server/deps.ts` 里的占位函数换成真的：`reduce`、`advanceChar`、`planDay`、`initContext` 从 `@/orchestrator` 导入。

### 2. 给 `reduce.ts` 加一道保护

`withResult` 里的两处非空断言去掉：字不在 `stageOf` 里时按 `recognize` 处理，不在 `kindOf` 里时按 `recognize_only` 处理。加测试。这是本任务唯一允许改动 `src/orchestrator/` 的地方。

### 3. 效果执行器

在 `src/server/effects.ts` 里处理 D1 留着没处理的三种效果。D1 的 `handleEvent` 改为调用它。

| 效果 | 服务端做什么 | 返回给孩子端什么 |
| --- | --- | --- |
| `call_agent` / `char_coach` | 查字卡和孩子信息，组装 `CharCoachInput`（`step: "explain"`，历史为空），过护栏调用 | `say`、`ask`、字卡里给孩子看的字段（字、拼音） |
| `call_agent` / `vision_dictation` | `expectedWords` 用 payload 里的单字；图片转成 data URL；调用（不过护栏，输出不是给孩子看的话） | `marks`，以及每个字的标准写法 |
| `call_agent` / `reader`、`essay` | 本任务不实现，返回“即将开放”的占位数据 | 占位 |
| `play_audio` | 查每个字的 `dictationContext` 和 `audioUrl` | 每个字的报词文字和音频地址（没有音频时只有文字，孩子端自己显示） |
| `show` | 不处理 | 原样返回 |

要点：

- 字卡查不到（内容没准备好）时不调模型：这个字直接按“系统还没准备好”处理，给孩子一句兜底的话，并记一条 `incident`，类型 `knowledge`。
- 所有给孩子看的 `say` / `ask` 都经过 `withGuard`。被拦后重试一次，再被拦用 Agent 的兜底输出，并记一条 `incident`，类型按护栏给的原因对应。
- 每次模型调用通过 `onTurn` 写一条 `Turn`，`guardVerdict` 填护栏的最终结论；不过护栏的调用填 `skipped`。
- 模型客户端在服务端启动时创建一次：读 `config/models.json`，`createLlmClient`。配置不合法时服务启动失败并给出清楚的错误。

### 4. 讲字的多轮对话

理解环节不是一次调用，而是几轮对话。新增接口：

`POST /api/session/[id]/coach`，入参 `{ char, text }`（孩子说的话）。

服务端的流程：

1. 确认会话当前状态是 `understand`，且 `char` 是当前正在讲的字，否则返回 409。
2. 这个字的对话分三步，按顺序走：`explain` → `make_word` → `make_sentence`。当前走到哪一步、对话历史，存在服务端（和会话上下文分开存，不要往 `SessionContext` 里加字段）。
3. 用当前步骤和历史调 `char_coach`（过护栏）。
4. 根据输出的 `next`：
   - `wait_child`：把 `say`、`ask` 返回给孩子端，等下一句。
   - `step_done`：进入下一步；三步都完成时，向编排器发送 `understand_done`，结果为 `correct`，并把新的状态和效果一起返回。
   - `escalate`：记一条 `incident`（类型 `bad_question`），然后按 `wait_child` 处理。
5. 同一个字孩子说了 6 句还没走完三步：向编排器发送 `understand_done`，结果为 `wrong`。

孩子端显示讲解后第一次调用这个接口时 `text` 可以是空字符串，表示“我听完了”，此时从 `explain` 进入 `make_word`。

### 5. 作业清单

`POST /api/session/[id]/homework`，入参 `{ imageDataUrl?, spokenText? }`：

1. 调 `vision_homework`。
2. `unsure` 为真时返回“请再拍一次”，不改变状态。
3. 否则向编排器发送 `homework_captured`，把识别出的清单返回给孩子端确认。孩子确认后，孩子端再发 `homework_confirmed` 事件（走 D1 的事件接口）。

### 6. 图片

孩子端上传的是 data URL。服务端校验：是 `image/jpeg` 或 `image/png`，解码后不超过 2MB。直接把 data URL 传给模型，不落盘。`Turn` 表里存输入时把图片内容替换成 `"<image>"`，不要把整张图存进数据库。

### 7. 时长上限

每次处理事件前，用会话开始时间和 `now()` 算出已用分钟数。超过 `limitMinutes` 且当前不是 `wrap_up` 或 `ended` 时，先向编排器发送 `time_up`，把结果返回，不再处理孩子发来的那个事件。

### 8. 集成测试

`tests/integration/` 下，用真的编排器、真的数据访问层（临时 SQLite）、真的护栏规则层、真的 Agent 函数，只有模型是假的（一个按 Agent 名返回预设输出的假 `LlmClient`）。

## 验收标准

每条至少一个测试，测试名带编号。

1. 完整流程：种子数据（3 个会写字、1 个会认字），从 `POST /api/session` 开始，经过作业清单、认读、讲字（每个字三步对话）、报词、拍照、对照确认、拒绝阅读、收尾，到 `ended`。断言经过的状态序列。
2. 流程结束后，数据库里 4 个字的 `ChildChar` 阶段正确：全部答对时，会写字是 `review_2d`，会认字也是 `review_2d`，`nextReviewOn` 是当天加 2 天。
3. 第二天再开一次会话（把 `now()` 往后拨 2 天）：这 4 个字出现在复习里，不是新字。
4. 听写里写错一个字：当天结束后它的阶段是 `understand`；第二天的计划里它在遗留字中，会话跳过它的认读。
5. 每次模型调用都有一条 `Turn`；`Turn.input` 里不含 base64 图片内容。
6. 假模型让 `char_coach` 输出一句不引用字卡的话（`usedCardFields` 为空）：护栏拦下，重试一次；第二次仍这样，孩子收到的是兜底输出（字卡原文），数据库里有一条 `incident`。
7. 字卡不存在时：不调模型（断言假客户端调用次数不变），孩子收到兜底的话，有一条 `knowledge` 类型的 `incident`。
8. `coach` 接口：会话不在 `understand` 状态，或 `char` 不是当前的字，返回 409，不调模型。
9. `coach` 接口：孩子连说 6 句都没走完，编排器收到 `understand_done` 且结果为 `wrong`。
10. `homework` 接口：`unsure` 为真时状态不变。
11. 图片校验：非图片类型、超过 2MB 的 data URL 被拒绝，返回 400 和一句中文说明，不调模型。
12. 时长上限：把 `now()` 拨到超过 `limitMinutes`，下一个任意事件的返回状态是 `wrap_up`。
13. 模型全部失败（假客户端一律返回 `ok: false`）时，完整流程仍然能走到 `ended`，孩子收到的每句话都是兜底内容，没有任何接口返回 500。
14. `config/models.json` 里把一个运行时 Agent 改成 openai 时，创建服务端依赖的函数抛错（测试里用内存里的配置对象）。
15. `reduce.ts` 的保护：字不在 `stageOf` / `kindOf` 里时不产生 `undefined`。
16. `src/server/deps.ts` 里不再有占位函数。
17. `bash scripts/verify.sh C7` 通过，并且 `npm run build` 成功。

## 报告里要有

- 一张时序说明：孩子端的每个动作 → 调哪个接口 → 服务端依次做了什么。C2 的界面要按它来对接。
- 接口清单：地址、入参、返回值的例子。
- 你发现的各模块之间对不上的地方，逐条写进“契约问题”。这是这个任务最有价值的产出之一，不要为了让流程跑通而悄悄绕过。

## 不在范围内

- 不改界面（C2）。界面和这里的接口对不上时，写进报告。
- 不实现阅读和作文的 Agent 调用，只返回占位。
- 不做语音。
- 不改 `src/agents/`、`src/guard/`、`src/llm/`、`src/db/`，也不改契约。它们有问题就写进报告。
- 不调真实模型。
