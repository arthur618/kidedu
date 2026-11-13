import { describe, expect, it } from "vitest";
import { ReaderInput, ReaderOutput } from "../../contracts/schemas";
import { readerFixtures } from "../fixtures";
import { errors, fakeLlm } from "../test-helpers";
import { run } from "./index";
import { fallback } from "./fallback";
import { system, buildStablePrefix, buildUser } from "./prompt";

const input = readerFixtures[0]!.input;
describe("reader", () => {
  it.each([null, undefined, {}, { ...input, history: "invalid", imageUrl: 12, child: null }])("[1] 无效输入返回合法兜底且不调用模型：%j", async (invalid) => {
    const fake = fakeLlm(null);
    const result = await run(invalid as unknown as ReaderInput, fake);
    expect(ReaderOutput.safeParse(result).success).toBe(true);
    expect(fake.requests).toHaveLength(0);
  });
  it.each(errors)("[2] 模型%s时每组样例返回合法兜底", async (error) => {
    for (const fixture of readerFixtures) {
      const result = await run(fixture.input, fakeLlm(null, error));
      expect(ReaderOutput.parse(result)).toEqual(fallback(fixture.input));
    }
  });
  it("[2] 注入的客户端意外抛错也返回兜底", async () => {
    expect(await run(input, { llm: { async call() { throw new Error("fictional failure"); } } })).toEqual(fallback(input));
  });
  it("[3] 不同输入的请求system完全相同且复用契约schema", async () => {
    const fake = fakeLlm(fallback(input));
    await run(input, fake);
    const different = readerFixtures.at(-1)!.input;
    await run(different, fake);
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[0]!.system).toBe(system);
    expect(fake.requests[1]!.system).toBe(system);
    expect(fake.requests[0]!.schema).toBe(ReaderOutput);
    expect(fake.requests[0]!.agent).toBe("reader");
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

it("[5] keyPoints只进stablePrefix并注明不要念出来", async () => {
  const fake = fakeLlm(fallback(input));
  await run(input, fake);
  const request = fake.requests[0]!;
  expect(request.stablePrefix).toContain("不要念出来");
  expect(request.stablePrefix).toContain("keyPoints");
  expect(request.user).not.toContain("keyPoints");
  for (const point of input.passage.keyPoints) {
    expect(request.stablePrefix).toContain(point);
    expect(request.user).not.toContain(point);
    expect(request.system).not.toContain(point);
  }
});

it.each(["", "问".repeat(61), "先读一句。再问为什么？"])("[2] 兜底问题为空、过长或多句时使用短问题：%s", (question) => {
  expect(fallback({ ...input, passage: { ...input.passage, question } }).ask).toBe("读完短文，你想说什么？");
});
