import { describe, expect, it } from "vitest";
import { GuardOutput } from "../contracts/schemas";
import { checkWithModel, GUARD_SYSTEM } from "./model";
import { fakeLlm, input, success } from "./test-helpers";

describe("模型层", () => {
  it.each(["essay", "reading"] as const)("[验收8] %s 的三类模型失败都拦截", async (context) => {
    for (const error of ["timeout", "invalid_output", "provider_error"] as const) {
      const { llm, call } = fakeLlm({ ok: false, error, model: "fake", latencyMs: 0 });
      expect(await checkWithModel(input("候选内容", context), {}, { llm })).toEqual({
        verdict: "blocked", reason: context === "essay" ? "ghostwriting" : "answer_leak", layer: "model",
      });
      expect(call).toHaveBeenCalledTimes(1);
    }
  });
  it("[验收8] 抛异常、结构错误或结论矛盾也拦截", async () => {
    const { llm, call } = fakeLlm();
    call.mockRejectedValueOnce(new Error("模拟故障"));
    expect((await checkWithModel(input("候选内容"), {}, { llm })).verdict).toBe("blocked");
    for (const data of [null, {}, { verdict: "pass", reason: "ghostwriting" }, { verdict: "blocked", reason: "none" }, { verdict: "unsure", reason: "none" }]) {
      expect(await checkWithModel(input("候选内容", "reading"), {}, fakeLlm(success(data)))).toEqual({ verdict: "blocked", reason: "answer_leak", layer: "model" });
    }
  });
  it("[验收8] 成功时复用契约的小schema，固定系统词与可变数据分离", async () => {
    const fake = fakeLlm();
    const extra = { childLastUtterance: "我找到一颗石头", keyPoints: ["纸船停在桥边"] };
    expect(await checkWithModel(input("你当时在哪儿？"), extra, fake)).toEqual({ verdict: "pass", reason: "none", layer: "model" });
    const request = fake.call.mock.calls[0]![0];
    expect(request.agent).toBe("guard");
    expect(request.system).toBe(GUARD_SYSTEM);
    expect(JSON.parse(request.user)).toEqual({ ...input("你当时在哪儿？"), extra });
    expect(request.schema.parse({ verdict: "pass", reason: "none", layer: "rule" })).toEqual({ verdict: "pass", reason: "none" });
    expect(request.schema.safeParse({ verdict: "blocked", reason: "乱填" }).success).toBe(false);
    expect(GuardOutput.safeParse(await checkWithModel(input("候选内容"), {}, fake)).success).toBe(true);
  });
  it("[验收4] 模型确认代写时保留原因和模型层标记", async () => {
    const result = await checkWithModel(input("青翠的竹林为山坡披上了一件柔软的绿衣裳。"), {}, fakeLlm(success({ verdict: "blocked", reason: "ghostwriting" })));
    expect(result).toEqual({ verdict: "blocked", reason: "ghostwriting", layer: "model" });
  });
});
