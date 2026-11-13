import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { disconnectPrisma, setDatabaseUrlForTests } from "./client";

export interface TestDatabase {
  url: string;
  cleanup: () => Promise<void>;
}

/**
 * 为每个测试文件建一个临时 SQLite 数据库：用 prisma db push 建表，
 * 然后把数据库地址注入数据访问层。测试结束删掉临时目录。
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const dir = mkdtempSync(join(tmpdir(), "yuwen-banxue-db-"));
  const url = `file:${join(dir, "test.db")}`;
  const previousUrl = process.env.DATABASE_URL;
  const prismaBin = join(process.cwd(), "node_modules", ".bin", "prisma");

  try {
    execFileSync(
      prismaBin,
      ["db", "push", "--skip-generate", "--schema", join(process.cwd(), "prisma", "schema.prisma")],
      { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" },
    );
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr: unknown }).stderr)
        : String(error);
    throw new Error(`建测试数据库失败：${stderr}`);
  }

  setDatabaseUrlForTests(url);
  process.env.DATABASE_URL = url;

  return {
    url,
    async cleanup() {
      await disconnectPrisma();
      if (previousUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousUrl;
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
