import { expect, it, vi } from "vitest";
import { z } from "zod";
import { Child } from "../../../src/contracts/schemas";

it("实际受max约束数组超限先拒绝，不逐元素校验；合法输入仍逐项验证", () => {
  const visit = vi.fn(() => true); const schema = z.array(z.string().refine(visit)).max(2);
  const result = schema.safeParse(["甲", "乙", "丙"]);
  expect(result.success).toBe(false); expect(visit).not.toHaveBeenCalled();
  if (result.success) throw new Error("必须超限拒绝"); expect(result.error.issues).toMatchObject([{ code: "too_big", maximum: 2, path: [] }]);
  expect(schema.parse(["甲", "乙"])).toEqual(["甲", "乙"]); expect(visit).toHaveBeenCalledTimes(2);
  expect(Child.safeParse({ id: "synthetic", nickname: "编造", grade: 3, interests: ["甲", "乙", "丙", "丁", "戊", "己"] }).success).toBe(false);
});
it("实际受max约束Set超限先拒绝，合法集合仍执行element spy", () => {
  const visit = vi.fn(() => true); const schema = z.set(z.string().refine(visit)).max(2);
  expect(schema.safeParse(new Set(["甲", "乙", "丙"])).success).toBe(false); expect(visit).not.toHaveBeenCalled();
  expect(schema.parse(new Set(["甲", "乙"]))).toEqual(new Set(["甲", "乙"])); expect(visit).toHaveBeenCalledTimes(2);
});
it("实际受max约束Map超限先拒绝，key与value均不逐项执行", () => {
  const keyVisit = vi.fn(() => true), valueVisit = vi.fn(() => true);
  const schema = z.map(z.string().refine(keyVisit), z.number().refine(valueVisit)).max(2);
  expect(schema.safeParse(new Map([["甲", 1], ["乙", 2], ["丙", 3]])).success).toBe(false);
  expect(keyVisit).not.toHaveBeenCalled(); expect(valueVisit).not.toHaveBeenCalled();
  expect(schema.parse(new Map([["甲", 0]]))).toEqual(new Map([["甲", 0]])); expect(keyVisit).toHaveBeenCalledTimes(1); expect(valueVisit).toHaveBeenCalledTimes(1);
});
