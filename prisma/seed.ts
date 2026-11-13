import { disconnectPrisma } from "../src/db/client";
import { seedDatabase } from "../src/db/seed";

try {
  const summary = await seedDatabase();
  console.log(
    `种子数据已写入：孩子 ${summary.childId}，课 ${summary.lessonId}，字卡 ${summary.cardCount} 张。`,
  );
} catch (error) {
  console.error("写入种子数据失败：", error);
  process.exitCode = 1;
} finally {
  await disconnectPrisma();
}
