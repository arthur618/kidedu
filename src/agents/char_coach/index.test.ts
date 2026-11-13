import { describe, expect, it } from "vitest";
import { CharCoachInput, CharCoachOutput } from "../../contracts/schemas";
import { charCoachFixtures } from "../fixtures";
import { errors, fakeLlm } from "../test-helpers";
import { run } from "./index";
import { fallback } from "./fallback";
import { system, buildStablePrefix, buildUser } from "./prompt";

const input = charCoachFixtures[0]!.input;
describe("char_coach", () => {
  it.each([null, undefined, {}, { ...input, history: "invalid", imageUrl: 12, child: null }])("[1] 无效输入返回合法兜底且不调用模型：%j", async (invalid) => {
    const fake = fakeLlm(null);
    const result = await run(invalid as unknown as CharCoachInput, fake);
    expect(CharCoachOutput.safeParse(result).success).toBe(true);
    expect(fake.requests).toHaveLength(0);
  });
  it.each(errors)("[2] 模型%s时每组样例返回合法兜底", async (error) => {
    for (const fixture of charCoachFixtures) {
      const result = await run(fixture.input, fakeLlm(null, error));
      expect(CharCoachOutput.parse(result)).toEqual(fallback(fixture.input));
    }
  });
  it("[2] 注入的客户端意外抛错也返回兜底", async () => {
    expect(await run(input, { llm: { async call() { throw new Error("fictional failure"); } } })).toEqual(fallback(input));
  });
  it("[3] 不同输入的请求system完全相同且复用契约schema", async () => {
    const fake = fakeLlm(fallback(input));
    await run(input, fake);
    const different = charCoachFixtures.at(-1)!.input;
    await run(different, fake);
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[0]!.system).toBe(system);
    expect(fake.requests[1]!.system).toBe(system);
    expect(fake.requests[0]!.schema).toBe(CharCoachOutput);
    expect(fake.requests[0]!.agent).toBe("char_coach");
    expect(fake.requests[0]!.stablePrefix).toBe(buildStablePrefix(input));
    expect(fake.requests[0]!.user).toBe(buildUser(input));
    expect(system).toContain("正：");
    expect(system).toContain("反：");
  });
  it("[2] 成功时返回客户端data", async () => {
    const output = fallback(input);
    expect(await run(input, fakeLlm(output))).toEqual(output);
  });
});

it("[4] 字卡知识仅放stablePrefix，user仅放孩子信息步骤历史", () => {
  const prefix = buildStablePrefix(input);
  const user = buildUser(input);
  const stable = JSON.parse(prefix) as { card: CharCoachInput["card"] };
  expect(stable.card.explain).toBe(input.card.explain);
  expect(stable.card.words).toEqual(input.card.words);
  expect(stable.card.confusable).toEqual(input.card.confusable);
  for (const value of [input.card.explain, ...input.card.words, ...input.card.confusable, input.card.pinyin]) expect(user).not.toContain(value);
  expect(JSON.parse(user)).toEqual({ child: input.child, step: input.step, history: input.history });
});
it("[2] 解释兜底只返回字卡原文，超长取首句并遵守80字上限", () => {
  expect(fallback(input).say).toBe(input.card.explain);
  expect(fallback({ ...input, card: { ...input.card, explain: "先看单人旁。" + "木".repeat(90) } }).say).toBe("先看单人旁。");
  expect(fallback({ ...input, card: { ...input.card, explain: "木".repeat(90) } }).say).toBe("木".repeat(80));
  expect(fallback({ ...input, card: { ...input.card, explain: "先看左边。再看右边。对照字形。" } }).say).toBe("先看左边。");
});
