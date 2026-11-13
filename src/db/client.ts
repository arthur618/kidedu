import { PrismaClient } from "@prisma/client";

let client: PrismaClient | null = null;
let overrideUrl: string | null = null;

/** 测试里换数据库地址用；生产代码不调用。 */
export function setDatabaseUrlForTests(url: string): void {
  overrideUrl = url;
  if (client) {
    void client.$disconnect();
    client = null;
  }
}

/** 数据库地址：测试注入 > 环境变量 > 本地开发默认。 */
export function getDatabaseUrl(): string {
  return overrideUrl ?? process.env.DATABASE_URL ?? "file:./dev.db";
}

/** 懒加载 Prisma 客户端，避免在建表之前就连接数据库。 */
export function getPrisma(): PrismaClient {
  if (!client) {
    client = new PrismaClient({ datasourceUrl: getDatabaseUrl() });
  }
  return client;
}

/** 关闭连接；测试收尾和脚本退出前调用。 */
export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}
