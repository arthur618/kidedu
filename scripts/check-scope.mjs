// 用法：node scripts/check-scope.mjs <任务号> [基准分支，默认 main]
// 检查当前分支相对基准分支的改动是否都在该任务允许的路径内，且没有改契约。
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const [task, base = "main"] = process.argv.slice(2);
if (!task) {
  console.error("缺少任务号，例如：node scripts/check-scope.mjs C1");
  process.exit(2);
}
const scopes = JSON.parse(readFileSync("tasks/scopes.json", "utf8"));
const allowed = scopes[task];
if (!allowed) {
  console.error(`tasks/scopes.json 里没有任务 ${task}`);
  process.exit(2);
}
const always = ["package.json", "package-lock.json", `reports/${task}.md`];
const changed = execSync(`git diff --name-only ${base}...HEAD`, { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const bad = changed.filter((f) => !always.includes(f) && !allowed.some((p) => f === p || f.startsWith(p)));
const contract = changed.filter((f) => f.startsWith("src/contracts/"));

if (contract.length) console.error("改动了契约文件（不允许）：\n  " + contract.join("\n  "));
if (bad.length) console.error("改动超出任务范围：\n  " + bad.join("\n  "));
if (contract.length || bad.length) process.exit(1);
console.log(`范围检查通过：${changed.length} 个文件都在 ${task} 的范围内。`);
