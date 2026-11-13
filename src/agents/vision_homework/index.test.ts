import { describe, expect, it } from "vitest";
import { VisionHomeworkInput, VisionHomeworkOutput } from "../../contracts/schemas";
import { visionHomeworkFixtures } from "../fixtures";
import { errors, fakeLlm } from "../test-helpers";
import { run } from "./index";
import { fallback } from "./fallback";
import { system, buildStablePrefix, buildUser } from "./prompt";

const input = visionHomeworkFixtures[0]!.input;
describe("vision_homework", () => {
  it.each([null, undefined, {}, { ...input, history: "invalid", imageUrl: 12, child: null }])("[1] 无效输入返回合法兜底且不调用模型：%j", async (invalid) => {
    const fake = fakeLlm(null);
    const result = await run(invalid as unknown as VisionHomeworkInput, fake);
    expect(VisionHomeworkOutput.safeParse(result).success).toBe(true);
    expect(fake.requests).toHaveLength(0);
  });
  it.each(errors)("[2] 模型%s时每组样例返回合法兜底", async (error) => {
    for (const fixture of visionHomeworkFixtures) {
      const result = await run(fixture.input, fakeLlm(null, error));
      expect(VisionHomeworkOutput.parse(result)).toEqual(fallback(fixture.input));
    }
  });
  it("[2] 注入的客户端意外抛错也返回兜底", async () => {
    expect(await run(input, { llm: { async call() { throw new Error("fictional failure"); } } })).toEqual(fallback(input));
  });
  it("[3] 不同输入的请求system完全相同且复用契约schema", async () => {
    const fake = fakeLlm(fallback(input));
    await run(input, fake);
    const different = visionHomeworkFixtures.at(-1)!.input;
    await run(different, fake);
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[0]!.system).toBe(system);
    expect(fake.requests[1]!.system).toBe(system);
    expect(fake.requests[0]!.schema).toBe(VisionHomeworkOutput);
    expect(fake.requests[0]!.agent).toBe("vision_homework");
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

it("[3] 图片通过契约images字段传递", async () => {
  const withImage = { ...input, imageUrl: "https://example.test/fictional-image.jpg" };
  const fake = fakeLlm(fallback(withImage));
  await run(withImage, fake);
  expect(fake.requests[0]!.images).toEqual([{ url: withImage.imageUrl }]);
  expect(fake.requests[0]!.user).not.toContain(withImage.imageUrl);
});

it("[3] 仅口述时不发送图片，user保留口述原文", async () => {
  const fake = fakeLlm(fallback(input));
  await run(input, fake);
  expect(fake.requests[0]!.images).toEqual([]);
  expect(JSON.parse(fake.requests[0]!.user)).toEqual({ spokenText: input.spokenText });
});
