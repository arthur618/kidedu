import { disconnectPrisma } from "../src/db/client";
import { importContent } from "../src/db/import";

const dir = process.argv[2];

if (!dir) {
  console.error("用法：npm run db:import -- <目录>");
  process.exitCode = 1;
} else {
  try {
    const summary = await importContent(dir);
    console.log(
      `导入完成：课 ${summary.lessons} 个，字卡 ${summary.cards} 张，短文 ${summary.passages} 篇，跳过 ${summary.skipped} 个未审核文件。`,
    );
  } catch (error) {
    console.error("导入失败：", error);
    process.exitCode = 1;
  } finally {
    await disconnectPrisma();
  }
}
