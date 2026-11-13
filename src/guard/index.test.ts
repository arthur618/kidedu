import { describe, expect, it, vi } from "vitest";
import { guard, withGuard } from "./index";
import type { GuardInput } from "../contracts/schemas";
import type { GuardExtra } from "./rules";
import { fakeLlm, input, success } from "./test-helpers";

describe("护栏组合", () => {
  it("[验收2] 同时命中规则4和规则5时先按规则4拦截", async () => {
    const fake = fakeLlm();
    expect(await guard(input("你可以写：一阵清风吹过稻田，金黄的波浪一直涌到远方。"), {}, fake)).toEqual({ verdict: "blocked", reason: "ghostwriting", layer: "rule" });
    expect(fake.call).toHaveBeenCalledTimes(0);
  });
  it("[验收3] 长提问、两个提问和引用孩子原话均直接通过", async () => {
    const fake = fakeLlm();
    for (const candidate of ["你走进院子以后第一眼看见的是什么？", "木头桥是什么颜色的？你走过吗？", "你说‘树下有石凳’，我记住了。"] ) {
      expect(await guard(input(candidate), { childLastUtterance: "院子里有棵树，树下有石凳" }, fake)).toEqual({ verdict: "pass", reason: "none", layer: "rule" });
    }
    expect(fake.call).toHaveBeenCalledTimes(0);
  });
  it("[验收4] 显式代写直接拦截；长描写必须送模型", async () => {
    const fake = fakeLlm();
    for (const candidate of ["你可以写：松树像一把撑开的大伞。", "开头可以先讲清晨的风。"] ) {
      expect(await guard(input(candidate), {}, fake)).toEqual({ verdict: "blocked", reason: "ghostwriting", layer: "rule" });
    }
    expect(fake.call).toHaveBeenCalledTimes(0);
    expect(await guard(input("青翠的竹林为山坡披上了一件柔软的绿衣裳。"), {}, fake)).toEqual({ verdict: "pass", reason: "none", layer: "model" });
    expect(fake.call).toHaveBeenCalledTimes(1);
  });
  it("[验收5] 阅读答案有连续6字重合时直接拦截", async () => {
    const fake = fakeLlm();
    expect(await guard(input("因为先找绳子会耽误救小猫呀", "reading"), { keyPoints: ["先找绳子会耽误救小猫，树枝快断了"] }, fake)).toEqual({ verdict: "blocked", reason: "answer_leak", layer: "rule" });
    expect(fake.call).toHaveBeenCalledTimes(0);
  });
  it("[验收6] 讲字时空字段或缺字段拦截，有字段通过", async () => {
    const fake = fakeLlm();
    for (const extra of [{}, { usedCardFields: [] }]) {
      expect(await guard(input("先看看字卡。", "char"), extra, fake)).toEqual({ verdict: "blocked", reason: "no_card_reference", layer: "rule" });
    }
    expect(await guard(input("先看看字卡。", "char"), { usedCardFields: ["explain"] }, fake)).toEqual({ verdict: "pass", reason: "none", layer: "rule" });
  });
  it("[验收7] 规则层通过和所有拦截原因均不调用模型", async () => {
    const fake = fakeLlm();
    const cases: Array<[GuardInput, GuardExtra]> = [
      [input("接着呢？"), {}], [input("自杀"), {}], [input("山".repeat(141)), {}],
      [input("看字卡。", "char"), {}], [input("好词"), {}],
      [input("小熊把蜂蜜送到树洞", "reading"), { keyPoints: ["小熊把蜂蜜送到树洞"] }],
    ];
    for (const [candidate, extra] of cases) expect((await guard(candidate, extra, fake)).layer).toBe("rule");
    expect(fake.call).toHaveBeenCalledTimes(0);
  });
  it("[验收8] 规则不确定后模型失败，最终保持 blocked", async () => {
    const fake = fakeLlm({ ok: false, error: "timeout", model: "fake", latencyMs: 0 });
    expect(await guard(input("小溪在石缝之间唱着歌奔向远处的竹林。"), {}, fake)).toEqual({ verdict: "blocked", reason: "ghostwriting", layer: "model" });
    expect(await guard(input("小熊先把掉到地上的果子全部装进了门口的大篮子里面。", "reading"), {}, fake)).toEqual({ verdict: "blocked", reason: "answer_leak", layer: "model" });
  });
});

describe("Agent重试与兜底", () => {
  const safe = { say: "你先看到什么？", ask: null, next: "wait_child" as const };
  const blocked = { say: "你可以写小鸟。", ask: null, next: "wait_child" as const };
  const backup = { say: "先歇一会儿吧。", ask: null, next: "wait_child" as const };

  it("[验收9] 首次被拦第二次通过，调用两次并返回完整第二次输出", async () => {
    const run = vi.fn().mockResolvedValueOnce(blocked).mockResolvedValueOnce(safe);
    const fallback = vi.fn(() => backup);
    const result = await withGuard(run, fallback, { agent: "essay", context: "essay", ...fakeLlm() });
    expect(run).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ output: safe, guard: { verdict: "pass", reason: "none", layer: "rule" }, usedFallback: false });
    expect(fallback).toHaveBeenCalledTimes(0);
  });
  it("[验收10] 两次被拦只调用一次兜底，保留最后的拦截原因", async () => {
    const run = vi.fn(async () => blocked);
    const fallback = vi.fn(async () => backup);
    const result = await withGuard(run, fallback, { agent: "essay", context: "essay", ...fakeLlm() });
    expect(run).toHaveBeenCalledTimes(2);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ output: backup, guard: { verdict: "blocked", reason: "ghostwriting", layer: "rule" }, usedFallback: true });
  });
  it("[验收11] 第一次通过仅调用一次Agent，say和ask都送审", async () => {
    const output = { ...safe, ask: "你想先讲哪一件事？", newCard: "我走进院子" };
    const run = vi.fn(() => output);
    const fallback = vi.fn(() => output);
    const fake = fakeLlm();
    expect(await withGuard(run, fallback, { agent: "essay", context: "essay", ...fake })).toEqual({ output, guard: { verdict: "pass", reason: "none", layer: "rule" }, usedFallback: false });
    expect(run).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledTimes(0);
    expect(fake.call).toHaveBeenCalledTimes(0);
    const badAsk = vi.fn(() => ({ ...safe, ask: "好句" as string | null }));
    expect((await withGuard(badAsk, () => safe, { agent: "essay", context: "essay", ...fake })).usedFallback).toBe(true);
  });
  it("[验收9] 每次重算字卡引用，可从输出或extra回调取字段", async () => {
    const run = vi.fn().mockResolvedValueOnce({ ...safe, usedCardFields: [] }).mockResolvedValueOnce({ ...safe, usedCardFields: ["explain"] });
    const extra = vi.fn(() => ({ childLastUtterance: "我到院子里了" }));
    const result = await withGuard(run, () => safe, { agent: "char_coach", context: "char", extra, ...fakeLlm() });
    expect(result.usedFallback).toBe(false);
    expect(run).toHaveBeenCalledTimes(2);
    expect(extra).toHaveBeenCalledTimes(2);
  });
  it("[验收10] 连续模型故障最终兜底，保留模型层标记", async () => {
    const fake = fakeLlm({ ok: false, error: "provider_error", model: "fake", latencyMs: 0 });
    const run = vi.fn(() => ({ ...safe, say: "夜空中无数的小星星好像正在眨着明亮的眼睛。" }));
    const result = await withGuard(run, () => backup, { agent: "essay", context: "essay", ...fake });
    expect(run).toHaveBeenCalledTimes(2);
    expect(fake.call).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ output: backup, guard: { verdict: "blocked", reason: "ghostwriting", layer: "model" }, usedFallback: true });
  });
  it("[验收9] 模型首次拦截、第二次放行时返回第二次模型结论", async () => {
    const fake = fakeLlm();
    fake.call.mockResolvedValueOnce(success({ verdict: "blocked", reason: "ghostwriting" }));
    const output = { ...safe, say: "我看见了你说的院子角落和地上的小石头。" };
    const run = vi.fn(() => output);
    const result = await withGuard(run, () => backup, { agent: "essay", context: "essay", ...fake });
    expect(result.guard).toEqual({ verdict: "pass", reason: "none", layer: "model" });
    expect(result.output).toBe(output);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
