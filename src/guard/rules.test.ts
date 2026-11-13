import { describe, expect, it } from "vitest";
import { checkRules } from "./rules";
import { input } from "./test-helpers";
import { SENSITIVE_WORDS } from "./wordlist";

describe("验收1：规则表逐项命中与不命中", () => {
  it("[验收1][规则1] 命中敏感词；同时超长时仍先报 unsafe", () => {
    expect(checkRules(input(`自残${"山".repeat(141)}`))).toEqual({ verdict: "blocked", reason: "unsafe" });
    expect(SENSITIVE_WORDS.length).toBeLessThanOrEqual(30);
    for (const word of SENSITIVE_WORDS) {
      expect(checkRules(input(`故事里出现了${word}。`))).toEqual({ verdict: "blocked", reason: "unsafe" });
    }
  });
  it("[验收1][规则1] 不命中：普通文字", () => {
    expect(checkRules(input("你想先讲哪一段？"))).toEqual({ verdict: "pass" });
  });
  it("[验收1][规则2] 命中：去空白超过140字或超过3句，先于字卡检查", () => {
    expect(checkRules(input("山".repeat(141), "char"))).toEqual({ verdict: "blocked", reason: "too_long" });
    for (const candidate of ["看。听！想？说。", "看!听?想。说！"]) {
      expect(checkRules(input(candidate))).toEqual({ verdict: "blocked", reason: "too_long" });
    }
  });
  it("[验收1][规则2] 不命中：140字、空白不计数、恰好3句", () => {
    expect(checkRules(input(` ${"山 \n".repeat(140)} `, "char"), { usedCardFields: ["explain"] })).toEqual({ verdict: "pass" });
    expect(checkRules(input("看。听！想？"))).toEqual({ verdict: "pass" });
    expect(checkRules(input("𠮷".repeat(140), "char"), { usedCardFields: ["explain"] })).toEqual({ verdict: "pass" });
  });
  it("[验收1][规则3] 命中：认字教练没有字卡字段", () => {
    expect(checkRules(input("先看看字卡。", "char"))).toEqual({ verdict: "blocked", reason: "no_card_reference" });
  });
  it("[验收1][规则3] 不命中：有字段、非教练或非讲字场景", () => {
    expect(checkRules(input("看字卡。", "char"), { usedCardFields: ["pinyin"] })).toEqual({ verdict: "pass" });
    expect(checkRules({ ...input("看一看。", "char"), agent: "reader" })).toEqual({ verdict: "pass" });
    expect(checkRules({ ...input("先想一想。"), agent: "char_coach" })).toEqual({ verdict: "pass" });
  });
  it("[验收1][规则4] 命中：七种代写说法全部拦截", () => {
    for (const phrase of ["你可以写", "可以这样写", "比如写", "开头可以", "结尾可以", "好词", "好句"]) {
      expect(checkRules(input(`${phrase}一片云。`))).toEqual({ verdict: "blocked", reason: "ghostwriting" });
    }
  });
  it("[验收1][规则4] 不命中：非作文或没有代写说法", () => {
    expect(checkRules(input("你可以写", "reading"))).toEqual({ verdict: "pass" });
    expect(checkRules(input("你会先讲哪件事？"))).toEqual({ verdict: "pass" });
  });
  it("[验收1][规则5] 命中：超过12字的非孩子原话陈述句，包括无句号尾句", () => {
    for (const text of ["银色的小鱼沿着水草慢慢地游了过去。", "银色的小鱼沿着水草慢慢地游了过去"]) {
      expect(checkRules(input(text))).toEqual({ verdict: "unsure" });
    }
    expect(checkRules(input("山".repeat(13)))).toEqual({ verdict: "unsure" });
  });
  it("[验收1][规则5] 不命中：长度边界、问句、完整原话和两类引号引用", () => {
    const child = "我在院子角落找到了一颗圆圆的小石头";
    for (const candidate of ["山".repeat(12), "你当时在院子哪个角落找到小石头？", "当时你有认真看清楚那颗小石头吗。", "那颗小石头旁边还有什么东西呢！", `${child}。`, `你说“${child}”，我记住了。`, `你说‘${child}’，我记住了。`]) {
      expect(checkRules(input(candidate), { childLastUtterance: child })).toEqual({ verdict: "pass" });
    }
  });
  it("[验收1][规则5] 非孩子原话不能靠引号放行；引用也不能跳过规则4", () => {
    expect(checkRules(input("你说‘白云像绵软的棉花轻轻飘过了山顶’。"), { childLastUtterance: "我看见白云" })).toEqual({ verdict: "unsure" });
    expect(checkRules(input("你说‘好句’。"), { childLastUtterance: "好句" })).toEqual({ verdict: "blocked", reason: "ghostwriting" });
  });
  it("[验收1][规则6] 命中：任意要点中的连续6字及更长片段，先于规则7", () => {
    const extra = { keyPoints: ["", "他要先把小树苗扶正，再去拿绳子"] };
    expect(checkRules(input("把小树苗扶正", "reading"), extra)).toEqual({ verdict: "blocked", reason: "answer_leak" });
    expect(checkRules(input(`因为他要先把小树苗扶正${"呀".repeat(22)}`, "reading"), extra)).toEqual({ verdict: "blocked", reason: "answer_leak" });
  });
  it("[验收1][规则6] 不命中：5字重合、非连续重合、空要点或不同场景", () => {
    const extra = { keyPoints: ["把小树苗扶正"] };
    for (const candidate of ["小树苗扶正", "把小树苗先扶正", "你找到理由了吗？"]) {
      expect(checkRules(input(candidate, "reading"), extra)).toEqual({ verdict: "pass" });
    }
    expect(checkRules(input("把小树苗扶正"), extra)).toEqual({ verdict: "pass" });
    expect(checkRules(input("先说说理由。", "reading"), { keyPoints: ["", "扶正"] })).toEqual({ verdict: "pass" });
  });
  it("[验收1][规则7] 命中：阅读中超过20字的陈述句", () => {
    expect(checkRules(input("小姑娘先把落在地上的纸捡起来放进门旁的纸箱里面。", "reading"))).toEqual({ verdict: "unsure" });
    expect(checkRules(input("山".repeat(21), "reading"))).toEqual({ verdict: "unsure" });
  });
  it("[验收1][规则7] 不命中：20字边界或更长的问句", () => {
    expect(checkRules(input("山".repeat(20), "reading"))).toEqual({ verdict: "pass" });
    expect(checkRules(input("你能不能找出小姑娘把纸捡起来以后又做了什么事情？", "reading"))).toEqual({ verdict: "pass" });
  });
  it("[验收1][规则8] 命中：其余短提问通过", () => {
    expect(checkRules(input("接着发生了什么？", "reading"))).toEqual({ verdict: "pass" });
  });
  it("[验收1][规则8] 不命中：前面的不确定结论不能落到默认通过", () => {
    expect(checkRules(input("微风把树梢上的叶子轻轻吹到了小路边。"))).toEqual({ verdict: "unsure" });
  });
});
