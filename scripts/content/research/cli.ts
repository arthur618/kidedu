import path from "node:path";
import { fileURLToPath } from "node:url";
import { constants } from "node:fs";
import { lstat, mkdir, open, link, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { ResearchRequestSchema, ResearchArtifactSchema, type PublicResearchClient } from "../../../src/contracts/research";
import { createPublicResearchClient } from "./client";

const help = "公开资料查证：npm run content:research -- --query 公开教材字词 --count 3 --id 唯一编号\n仅人工输入公开资料检索词，不接受文件、标准输入、孩子或会话数据。默认关闭；结果仅供人工核对来源和授权，不能直接批准或给孩子使用。";
async function safeDirectories(directory: string): Promise<void> {
  const absolute = path.resolve(directory);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error();
  }
}
export async function writeReference(root: string, id: string, artifact: unknown, signal?: AbortSignal): Promise<string> {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(id)) throw new Error();
  const data = ResearchArtifactSchema.parse(artifact);
  const content = path.join(path.resolve(root), "content");
  await safeDirectories(content);
  const directory = path.join(content, "research");
  try { await mkdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  await safeDirectories(directory);
  const destination = path.join(directory, `${id}.json`);
  const temporary = path.join(directory, `.${id}-${randomUUID()}.tmp`);
  let created = false;
  try {
    if (signal?.aborted) throw new Error();
    const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    created = true;
    try { await handle.writeFile(JSON.stringify(data, null, 2) + "\n", "utf8"); await handle.sync(); }
    finally { await handle.close(); }
    await safeDirectories(directory);
    if (signal?.aborted) throw new Error();
    // hard link 只在目标不存在时原子创建；并发同id只有一个成功。
    await link(temporary, destination);
    return `content/research/${id}.json`;
  } finally { if (created) await unlink(temporary); }
}
export async function runResearchCli(args: string[], deps: { root?: string; client?: PublicResearchClient; log?: (message: string) => void; signal?: AbortSignal } = {}): Promise<number> {
  const log = deps.log ?? console.log;
  if (args.length === 1 && ["--help", "-h"].includes(args[0]!)) { log(help); return 0; }
  try {
    const flags: Record<string, string> = {};
    for (let i = 0; i < args.length; i += 2) {
      const name = args[i]!; const value = args[i + 1];
      if (!["--query", "--count", "--id"].includes(name) || flags[name] !== undefined || value === undefined) throw new Error();
      flags[name] = value;
    }
    if (!flags["--id"] || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(flags["--id"])) throw new Error();
    if (flags["--count"] !== undefined && !/^[1-5]$/.test(flags["--count"])) throw new Error();
    const request = ResearchRequestSchema.parse({ query: flags["--query"], count: flags["--count"] === undefined ? 3 : Number(flags["--count"]) });
    const client = deps.client ?? createPublicResearchClient({ fetch: globalThis.fetch, getEnv: name => process.env[name], now: Date.now });
    const result = await client.search(request, { signal: deps.signal });
    if (!result.ok) { log("公开资料查证未完成：" + ({ disabled: "服务未启用或未配置密钥。", invalid_input: "参数不正确。", timeout: "请求超时。", cancelled: "操作已取消。", provider_error: "检索服务暂不可用。", invalid_output: "检索结果格式不正确。" }[result.error])); return 1; }
    const location = await writeReference(deps.root ?? process.cwd(), flags["--id"], result.artifact, deps.signal);
    log(`已保存参考文件：${location}，共${result.artifact.results.length}条。请人工核对来源、内容和使用授权。`);
    return 0;
  } catch { log("公开资料查证未完成，请核对参数、项目根目录和编号；已有文件不会覆盖。使用--help查看说明。"); return 1; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
  void runResearchCli(process.argv.slice(2), { signal: controller.signal }).then(code => { process.exitCode = code; }).finally(() => {
    process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel);
  });
}
