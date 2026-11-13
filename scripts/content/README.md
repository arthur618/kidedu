# 离线内容生产操作指南

这六个命令只处理人工录入的公开课程和编造示例，不接收孩子的姓名、作业照片、录音或作文。请在项目根目录打开终端。需要先安装项目依赖（`npm ci`）；电脑须有 Node.js 22。

## 先看一个不联网的例子

仓库自带 `content/lessons/demo.json`，六个字是休、林、森、采、明、早；词表和故事完全编造，没有复制课文。`content/cards/` 的六张字卡和 `content/passages/demo-story.json` 都由假客户端生成，保留 **draft**，没有经过事实核验，不能当作审过的内容使用。

以下命令不需要密钥，也不会联网：

```sh
npm run content:cards -- content/lessons/demo.json --fake
npm run content:check
npm run content:sheet -- --date 2026-11-13
```

第一条会显示新建0张，因为示例字卡已经存在。要演示短文起草，请使用未用过的编号：

```sh
npm run content:passage -- --chars 休,森,采 --topic 林间游戏 --known content/known-chars/demo.txt --id demo-story-2 --fake
```

`--fake` 只会返回仓库内编造样例，生成别的字会失败。假审校始终返回空问题列表，只用于演示，不能替代独立模型审校和人工终审。示例 `known-chars/demo.txt` 是故事不同汉字的集合，用来展示统计流程，不代表某年级真实学过的字表。正式内容应由人工根据教学进度准备字表。

## 正式操作：从录入到批准

1. **准备模型。** 请负责人编辑 `config/models.offline.json` 中的模型名，占位名不能直接使用。`draft` 默认 OpenAI，`review` 默认 DeepSeek；生成字卡和短文的起草与审校厂商必须不同；人工课程没有起草厂商，不受此项限制。按项目现有方法在本机设置配置中指定的环境变量，切勿把密钥写入课程、报告或审核表。命令复用 `src/llm/offline.ts`，不自己拼请求。正式操作不加 `--fake`。
2. **录入一课。** 复制 `content/lessons/demo.json` 到 `content/lessons/3-upper-2.json` 等新文件名，改编号、年级、册次、课次、标题、生字和词语。`upper`为上册，`lower`为下册；`recognizeChars`是会认字，`writeChars`是会写字。保留`status`为`draft`，不要粘贴课文原文。
3. **起草字卡。** 执行 `npm run content:cards -- content/lessons/3-upper-2.json`。两个生字表合并去重，每个没有文件的字生成一张`content/cards/字.json`。所有已经存在的字卡都跳过，无论状态如何。起草的`source`留空，`audioUrl`为`null`。若中途失败，已完成的字卡保留，下次运行只补缺少的字。
4. **准备已知字表并起草短文。** 在`content/known-chars/3-upper.txt`中每行写一个已学过的汉字。执行下面的短文命令。`--id`为不重复的文件编号，不填则按当前UTC时间生成；已有编号不会覆盖。
5. **人工核对并填写出处。** 打开每张字卡JSON，核对读音、部首、常用词、字形讲解和形近字。形近字区别只能写在`explain`，不添加新知识字段；无法证实的字源故事删掉。把实际查证的词典、书籍及页码等写入`source`。不得填编造来源；不会编程也可以在文本编辑器中修改引号内文字，保留JSON格式。`source`须在检查和审校**之前**填好。
6. **跑代码检查。** 执行`npm run content:check`。终端列出每个文件的问题；无问题为`issues: []`。短文列出不同的超纲字，并把其数量写入`outOfScopeCount`。修正所有问题再运行，直到命令成功。
7. **独立模型挑错。** 执行`npm run content:review`。只有当前版本已通过检查的草稿才能审校；课程也须经过这一步。人工Lesson只审阅录入一致性，不让模型补字、补课文或替人工提供课程知识。字卡和短文验证审校厂商与当时起草厂商不同。模型不改正文，只写`_review`并把状态改成`reviewed`。即使发现问题，也标为`reviewed`，但命令返回失败、批准仍被阻止。`reviewed`不等于已通过人工终审。
8. **生成终审清单。** 执行`npm run content:sheet`。打开`content/review/当天UTC日期.md`，可用`--date 2026-11-13`指定文件名日期。清单包含所有reviewed课程、字卡、短文的完整JSON、出处、known字表快照、检查结果和模型问题。请逐条核对并打勾；打勾不会自动批准。
9. **明确批准。** 人工确认全部内容及出处可靠后，执行下面的批准命令，显式列出课程、字卡、短文文件。它们必须是当前check和review都有效、审校问题为空的`reviewed`。字卡还须有非空出处。所有文件先校验再写入，状态变为`approved`。重复批准直接跳过。

```sh
npm run content:passage -- --chars 休,森,采 --topic 足球 --known content/known-chars/3-upper.txt --id 3-upper-football
npm run content:check
npm run content:review
npm run content:sheet
npm run content:approve -- content/lessons/3-upper-2.json content/cards/休.json content/cards/森.json content/cards/采.json content/passages/3-upper-football.json
```

批准命令中的文件只作格式示意。实际一课可能有更多字卡，请列全。批准后再使用D1提供的入库工具，本流水线不负责入库。

## 发现问题、改动或运行失败时

- `content:check`检查draft和reviewed，不自动提升或降低状态；`content:review`只审draft。`rejected`不会自动重启，`approved`不会被任何命令覆盖，包括字卡起草、短文重名、检查、审校、清单和重复批准。不要手动降级已批准内容；需要修订时交由内容负责人处理新版本。
- 修改了reviewed文件的正文、出处、known快照或其他内容后，旧审核凭据会失效；即使再次check，旧review也不能继续用。请人工将这个**尚未批准**文件的`status`改回`draft`，删除旧`_review`，修正内容，再按check→review→sheet→approve重跑。不能靠手改`_check`或`_review`代替这些步骤。
- `_draft`记录起草厂商，`_knownChars`保存生成时的已知字快照，`_check`和`_review`记录内容指纹及检查/审校结果。这些是离线流程元数据，不是新的契约知识字段，也不会直接给孩子看。已知字表文件之后改变不会自动改变已有短文；需要更新尚未批准短文的`_knownChars`并重新完整审核。
- 字数按正文中的**汉字出现次数**计算，需300–500；超纲比例用**不同汉字**计算：不在known中的不同汉字数÷全文不同汉字数，最多3%。标点、数字、英文字母不计。语义是否合适、字源是否真实、问题是否需要推理仍须模型和人工审校。
- 发生模型失败时不会提升该文件的状态；之前完成的其他文件保留。检查或审校有问题时命令退出码为1。命令不会输出密钥或模型原始响应。具体问题查看终端、`_check.issues`及`_review.issues`。
- 为避免两个命令互相覆盖，命令会创建`content/.pipeline.lock`目录。正常结束或报错会释放锁。如果电脑意外断电，请先确认没有命令还在运行，再删除这个空锁目录重试。命令运行期间不要同时手工修改内容文件。
- 仅接受content的lessons/cards/passages目录直接下的JSON，不接受符号链接或目录外文件。坏JSON需要先在编辑器中修复。审核表同一天再次生成会更新当日清单；内容JSON不会因此改变。
- 每个命令都可加`--help`查看中文帮助。六命令的测试全部注入假`LlmClient`，不使用真实模型、不读取真实密钥、不含真实孩子数据。
