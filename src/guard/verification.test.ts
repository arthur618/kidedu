import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

// 子进程运行完整自查，仅跳过本测试防止递归；其他全部测试照常执行。
it.skipIf(process.env.C5_GUARD_VERIFY_CHILD === "1")(
  "[验收12] bash scripts/verify.sh C5 的四项检查全部通过",
  () => {
    const output = execFileSync("bash", ["scripts/verify.sh", "C5"], {
      cwd: process.cwd(),
      env: { ...process.env, C5_GUARD_VERIFY_CHILD: "1" },
      encoding: "utf8",
      timeout: 60_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    for (const check of ["== 1/4 类型检查 ==", "== 2/4 测试 ==", "== 3/4 范围检查 ==", "== 4/4 报告文件 ==", "范围检查通过", "reports/C5.md 存在", "全部通过。"]) {
      expect(output).toContain(check);
    }
  },
  65_000,
);
