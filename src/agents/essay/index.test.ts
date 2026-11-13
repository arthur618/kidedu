import { describe, expect, it } from "vitest";
import { EssayInput, EssayOutput } from "../../contracts/schemas";
import { essayFixtures } from "../fixtures";
import { errors, fakeLlm } from "../test-helpers";
import { run } from "./index";
import { fallback } from "./fallback";
import { system, buildStablePrefix, buildUser } from "./prompt";

const input = essayFixtures[0]!.input;
describe("essay", () => {
  it.each([null, undefined, {}, { ...input, history: "invalid", imageUrl: 12, child: null }])("[1] 无效输入返回合法兜底且不调用模型：%j", async (invalid) => {
    const fake = fakeLlm(null);
    const result = await run(invalid as unknown as EssayInput, fake);
    expect(EssayOutput.safeParse(result).success).toBe(true);
    expect(fake.requests).toHaveLength(0);
  });
  it.each(errors)("[2] 模型%s时每组样例返回合法兜底", async (error) => {
    for (const fixture of essayFixtures) {
      const result = await run(fixture.input, fakeLlm(null, error));
      expect(EssayOutput.parse(result)).toEqual(fallback(fixture.input));
    }
  });
  it("[2] 注入的客户端意外抛错也返回兜底", async () => {
    expect(await run(input, { llm: { async call() { throw new Error("fictional failure"); } } })).toEqual(fallback(input));
  });
  it("[3] 不同输入的请求system完全相同且复用契约schema", async () => {
    const fake = fakeLlm(fallback(input));
    await run(input, fake);
    const different = essayFixtures.at(-1)!.input;
    await run(different, fake);
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[0]!.system).toBe(system);
    expect(fake.requests[1]!.system).toBe(system);
    expect(fake.requests[0]!.schema).toBe(EssayOutput);
    expect(fake.requests[0]!.agent).toBe("essay");
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

it.each([
  ["原文", [{ role: "child", text: "我看见一把蓝伞" }], "我看见一把蓝伞", "我看见一把蓝伞"],
  ["连续子串", [{ role: "child", text: "我看见一把蓝伞" }], "蓝伞", "蓝伞"],
  ["模型润色", [{ role: "child", text: "我看见一把蓝伞" }], "一把美丽的蓝伞", null],
  ["拼接子串", [{ role: "child", text: "我看见一把蓝伞" }], "我蓝伞", null],
  ["历史为空", [], "蓝伞", null],
  ["只有agent", [{ role: "agent", text: "蓝伞" }], "蓝伞", null],
  ["不能取旧原话", [{ role: "child", text: "蓝伞" }, { role: "child", text: "纸船" }], "蓝伞", null],
  ["末尾agent不作来源", [{ role: "child", text: "蓝伞" }, { role: "agent", text: "纸船" }], "蓝伞", "蓝伞"],
  ["空字符串", [{ role: "child", text: "蓝伞" }], "", null],
  ["本来为空", [{ role: "child", text: "蓝伞" }], null, null],
] as const)("[6] newCard检查：%s", async (_name, history, newCard, expected) => {
  const candidate = { say: "再想想。", ask: "后来呢？", next: "wait_child" as const, newCard };
  const result = await run({ ...input, history: history.map((item) => ({ ...item })) }, fakeLlm(candidate));
  expect(result).toEqual({ ...candidate, newCard: expected });
  expect(candidate.newCard).toBe(newCard);
});

it("[2] 反馈兜底只引用首句的连续原文，不生成示范句", () => {
  const text = "蓝纸。纸船响了。风吹过来。";
  const result = fallback({ ...input, step: "reader_feedback", essayText: text });
  expect(result.say).toBe('我看见了：“蓝纸”');
  expect(result.ask).toBe("我还想知道，当时你是怎么想的？");
  expect(result.newCard).toBeNull();
});
