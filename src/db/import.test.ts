import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getCharCard } from "./charCard";
import { getPrisma } from "./client";
import { getLesson } from "./lesson";
import { getPassage } from "./passage";
import { createTestDatabase, type TestDatabase } from "./test-db";
import { testCard, testLesson, testPassage } from "./test-fixtures";

let db: TestDatabase | undefined;
let importDir: string | undefined;

beforeAll(async () => {
  db = await createTestDatabase();
  importDir = mkdtempSync(join(tmpdir(), "yuwen-import-"));
  for (const name of ["cards", "lessons", "passages"]) {
    mkdirSync(join(importDir, name), { recursive: true });
  }

  const draftCard = { ...testCard, id: "card-draft-import", char: "水", status: "draft" as const };
  writeFileSync(join(importDir, "cards", "approved.json"), JSON.stringify(testCard), "utf8");
  writeFileSync(join(importDir, "cards", "draft.json"), JSON.stringify(draftCard), "utf8");
  writeFileSync(join(importDir, "lessons", "approved.json"), JSON.stringify(testLesson), "utf8");
  writeFileSync(join(importDir, "passages", "approved.json"), JSON.stringify(testPassage), "utf8");
}, 60_000);

afterAll(async () => {
  await db?.cleanup();
  if (importDir) rmSync(importDir, { recursive: true, force: true });
});

describe("npm run db:import", () => {
  it("只导入 approved 的文件，draft 不导入", async () => {
    if (!db || !importDir) throw new Error("测试环境还没准备好");

    execFileSync("npm", ["run", "db:import", "--", importDir], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: db.url },
      stdio: "pipe",
    });

    await expect(getCharCard("山")).resolves.toEqual(testCard);
    await expect(getCharCard("水")).resolves.toBeNull();
    await expect(getLesson(testLesson.id)).resolves.toEqual(testLesson);
    await expect(getPassage(testPassage.id)).resolves.toEqual(testPassage);
    await expect(getPrisma().charCard.count()).resolves.toBe(1);
  }, 120_000);

  it("再导一次按主键更新，不重复", async () => {
    if (!db || !importDir) throw new Error("测试环境还没准备好");

    execFileSync("npm", ["run", "db:import", "--", importDir], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: db.url },
      stdio: "pipe",
    });

    await expect(getPrisma().charCard.count()).resolves.toBe(1);
    await expect(getPrisma().lesson.count()).resolves.toBe(1);
    await expect(getPrisma().passage.count()).resolves.toBe(1);
  }, 120_000);
});
