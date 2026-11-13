# 护栏

`guard(input, extra, { llm })` 先做确定性的规则检查。只有 `unsure` 才通过契约 `LlmClient` 请求 `guard` Agent，不直接引用模型实现或厂商 SDK。通过返回 `reason: "none"`；拦截返回原因；`layer` 表明判定来自规则还是模型。

## 按顺序检查的规则

命中第一条就返回，引用孩子的话也不能绕过前面的敏感词、长度、字卡或代写词检查。

| 序号 | 条件及结果 | 自编例子 |
| --- | --- | --- |
| 1 | 包含敏感词，拦截 `unsafe` | “他要杀人。” |
| 2 | 去空白后超过140字，或超过3句，拦截 `too_long` | “看。听。想。说。” |
| 3 | `char` 场景的 `char_coach` 没有 `usedCardFields`，拦截 `no_card_reference` | “先看看字卡。”但没有传引用字段 |
| 4 | `essay` 含七种代写说法，拦截 `ghostwriting` | “比如写小溪。” |
| 5 | `essay` 有超过12字、非问句、非孩子原话的句子，交给模型 | “白色的云朵慢慢地飘过远处的山峰。” |
| 6 | `reading` 与任意要点有至少连续6字重合，拦截 `answer_leak` | 要点“松鼠把果子藏进树洞”，候选“因为松鼠把果子藏进树洞呀” |
| 7 | `reading` 有超过20字的陈述句，交给模型 | “小兔先把落在草地上的胡萝卜全部放进了墙边的大篮子里面。” |
| 8 | 其余直接通过 | “你想先讲哪一件事？” |

字数按 Unicode 字符计，去掉空白；句长不计末尾的句子分隔标点，其他内部标点计入长度。句子按 `。！？!?` 切分，保留句尾以识别问句。`？` 结尾，或者 `吗`、`呢` 加分隔标点结尾视为问句。规则5先移除 `“”`、`‘’` 中属于 `childLastUtterance` 子串的引用（含引号），然后检查剩下的句子；整句与孩子原话比较时不包含末尾分隔标点。规则6检查原文，不跨空格或标点拼接要点。

`extra` 可包含 `usedCardFields`、`childLastUtterance`、`keyPoints`，只用于审查。规则3只检查引用字段是否存在，无法确认知识是否真的出自审过的字卡；调用方仍须提供可信的内容库数据。

## 模型层

`checkWithModel` 供 `guard` 在规则不确定时使用。固定系统词包含作文、阅读各三个通过和三个拦截的例子。候选和上下文以 JSON 放入 `user`，不拼入系统词。

输出校验复用 `GuardOutput.pick`，模型只返回 `verdict`、`reason`，不能决定 `layer`。通过必须搭配 `none`，拦截必须搭配非 `none` 原因。`ok: false`、异常或非法结论都拦截：作文为 `ghostwriting`，阅读为 `answer_leak`。讲字场景不会从规则进入模型；直接调用模型函数失败时保守返回 `no_card_reference`。

## 调用与兜底

```ts
import { withGuard } from "./index";

const result = await withGuard(
  () => runEssayAgent(),
  () => ({ say: "先想想你亲眼看到的事吧。", ask: null, next: "wait_child" as const }),
  {
    agent: "essay",
    context: "essay",
    llm,
    extra: { childLastUtterance: "我在操场边看见一只猫" },
  },
);
// result.output：完整的Agent输出或兜底输出
// result.guard：最终候选的护栏结论，用于Turn与Incident
// result.usedFallback：是否使用兜底
```

`run` 和 `fallback` 支持同步或异步；输出至少带 `say` 与可为空的 `ask`，审查两者拼接的全文。第一次被拦后原样再调一次 `run`（最多共两次）；第二次仍被拦才调一次 `fallback`。调用方可在 `run` 闭包里管理重写状态。额外输出字段会完整保留。

`opts.extra` 也可传 `(output) => extra`，每次候选分别计算；若输出有 `usedCardFields`，优先使用当前候选的字段，包括空数组，防止上一轮的引用被沿用。兜底须由调用方提供可信的正常话术或审过的内容库原文，不再调模型；此时 `result.guard` 保留第二次的 `blocked`，不能把它当作对兜底的审查。Agent 自身抛错向调用方传播；本任务只处理护栏拦截后的重试。

## 扩展与验证

添加敏感词：修改 `wordlist.ts`，总数保持30以内，交负责人审核；词表仅是起步，按原文字面包含检查，不负责变体识别。

添加规则：先由负责人修改规则表；在 `rules.ts` 的指定顺序实现，复用契约中的原因枚举，在测试里补命中、不命中、边界和优先级案例。不要直接修改契约，也不要因验收例子而放宽规则。

测试全部用自编文本和假的 `LlmClient`，不调用真实模型。执行 `bash scripts/verify.sh C5`。验收12的测试会在子进程再运行完整自查，并仅跳过自己以防递归；子进程仍运行其余所有测试及类型、范围和报告检查。

当前按任务表在超过3句时拦截；总规则要求每次对孩子说话不超过两句，这个口径差异已列入 `reports/C5.md` 的“契约问题”，需负责人统一。
