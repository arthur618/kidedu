import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fixtures } from "../src/agents/fixtures";
import { inputSchemas } from "./checks";
import { loadPublicCases, validateCases } from "./load";
const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), "cases");
describe("样例完整性", () => {
  it("全部样例符合契约、数量和标注要求", async () => {
    const entries = await loadPublicCases(directory);
    const minimums = { char_coach: 30, reader: 20, essay: 20, guard: 100, vision_homework: 9 };
    for (const [agent, minimum] of Object.entries(minimums)) expect(entries.filter(e => e.agent === agent).length).toBeGreaterThanOrEqual(minimum);
    for (const { agent, sample } of entries) expect(inputSchemas[agent].safeParse(sample.input).success, sample.id).toBe(true);
    const coach = entries.filter(e => e.agent === "char_coach");
    for (const step of ["explain", "make_word", "make_sentence"]) expect(coach.filter(e => (e.sample.input as { step: string }).step === step).length).toBeGreaterThanOrEqual(8);
    const guard = entries.filter(e => e.agent === "guard");
    expect(guard.filter(e => e.sample.expected === "blocked")).toHaveLength(60);
    expect(guard.filter(e => e.sample.expected === "pass")).toHaveLength(40);
    const ready = entries.filter(e => e.sample.tags?.includes("requests_ready_sentence"));
    expect(ready.length).toBeGreaterThanOrEqual(6);
    const texts = ready.map(e => (e.sample.input as { history: Array<{ text: string }> }).history.at(-1)!.text);
    expect(new Set(texts).size).toBe(texts.length);
  });
  it("完整迁移C3文本fixtures和9个作业场景，仅模糊照片按裁决改编", async () => {
    const entries = await loadPublicCases(directory);
    for (const agent of ["char_coach", "reader", "essay", "vision_homework"] as const) {
      for (const fixture of fixtures[agent]) {
        const migrated = entries.find(e => e.agent === agent && e.sample.sourceFixture === fixture.name);
        expect(migrated, fixture.name).toBeDefined();
        if (agent === "vision_homework") {
          expect((migrated!.sample.input as { imageUrl: unknown }).imageUrl).toBeNull();
          if (fixture.name === "模糊照片") expect(migrated!.sample.note).toContain("改编");
          else expect(migrated!.sample.input).toEqual(fixture.input);
        } else expect(migrated!.sample.input).toEqual(fixture.input);
      }
    }
  });
  it("拒绝重复ID、未知检查和缺少护栏预期，强制保留基础检查", () => {
    const sample = { id: "a", input: fixtures.reader[0]!.input, note: "编造", checks: ["schema"] };
    expect(() => validateCases("reader", [sample, sample])).toThrow();
    expect(() => validateCases("reader", [{ ...sample, checks: ["unknown"] }])).toThrow();
    expect(validateCases("reader", [sample])[0]!.checks).toContain("no_answer_leak");
    expect(() => validateCases("guard", [{ ...sample, input: { agent: "essay", context: "essay", candidate: "你好。" } }])).toThrow();
  });
});
