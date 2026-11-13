import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaClient, type Prisma } from "@prisma/client";

/** 数据访问函数在事务内外都能用：事务内自动走同一个事务客户端。 */
type DbClient = Prisma.TransactionClient;

let client: PrismaClient | null = null;
let overrideUrl: string | null = null;
const transactionStorage = new AsyncLocalStorage<DbClient>();

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

function getRootClient(): PrismaClient {
  if (!client) {
    client = new PrismaClient({ datasourceUrl: getDatabaseUrl() });
  }
  return client;
}

/** 取当前客户端：在 withTransaction 里就是同一个事务客户端。 */
export function getPrisma(): DbClient {
  return transactionStorage.getStore() ?? getRootClient();
}

/**
 * 把一组数据访问放进同一个数据库事务。
 * handleEvent 用它保证 ChildChar、Session、SessionRuntime 共同提交或共同回滚。
 */
export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (transactionStorage.getStore()) return fn();
  const root = getRootClient();
  return root.$transaction(async (tx) => transactionStorage.run(tx, fn), {
    maxWait: 5_000,
    timeout: 15_000,
  });
}

/** 关闭连接；测试收尾和脚本退出前调用。 */
export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}
