import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../../../src/db/test-db";
import { getPrisma } from "../../../src/db/client";
import { insertTurn, getTurn } from "../../../src/db/turn";
import { testTurn } from "../../../src/db/test-fixtures";
import { ContractDataError } from "../../../src/db/errors";

let db: TestDatabase;
beforeAll(async () => { db = await createTestDatabase(); });
afterAll(async () => { await db.cleanup(); });
const cases: [string, { input?: unknown; output?: unknown }, unknown, unknown][] = [
  ["missing", {}, null, null],
  ["undefined", { input: undefined, output: undefined }, null, null],
  ["null", { input: null, output: null }, null, null],
  ["object", { input: { zero: 0 }, output: { keep: [0, null, false] } }, { zero: 0 }, { keep: [0, null, false] }],
];
it.each(cases)("真实SQLite Turn %s保持原编码与读取语义", async (name, fields, expectedInput, expectedOutput) => {
  const { input: _input, output: _output, ...base } = testTurn;
  const id = `c14-${name}`;
  await insertTurn({ ...base, id, ...fields });
  const row = await getPrisma().turn.findUniqueOrThrow({ where: { id } });
  expect(row.input).toBe(JSON.stringify(expectedInput)); expect(row.output).toBe(JSON.stringify(expectedOutput));
  expect(await getTurn(id)).toEqual({ ...base, id, input: expectedInput, output: expectedOutput });
});
it("真实SQLite坏JSON不绕过codec，错误仍归属原表和主键", async () => {
  const id = "c14-broken";
  await insertTurn({ ...testTurn, id }); await getPrisma().turn.update({ where: { id }, data: { input: "{" } });
  await expect(getTurn(id)).rejects.toBeInstanceOf(ContractDataError);
  await expect(getTurn(id)).rejects.toMatchObject({ table: "Turn", recordId: id });
});
