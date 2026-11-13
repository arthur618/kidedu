import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getCharCard } from "./charCard";
import { getPrisma } from "./client";
import { getLesson } from "./lesson";
import { createTestDatabase, type TestDatabase } from "./test-db";

let db: TestDatabase | undefined;

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);

afterAll(async () => {
  await db?.cleanup();
});

function runSeed(): void {
  if (!db) throw new Error("测试数据库还没准备好");
  execFileSync("npm", ["run", "db:seed"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: db.url },
    stdio: "pipe",
  });
}

describe("npm run db:seed", () => {
  it("跑两次不报错，数据不重复", async () => {
    runSeed();
    runSeed();

    const prisma = getPrisma();
    await expect(prisma.child.count()).resolves.toBe(1);
    await expect(prisma.lesson.count()).resolves.toBe(1);
    await expect(prisma.charCard.count()).resolves.toBe(6);
    await expect(getLesson("lesson-demo-g3-1")).resolves.not.toBeNull();
    await expect(getCharCard("山")).resolves.not.toBeNull();
  }, 120_000);
});
