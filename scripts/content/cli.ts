import { ContentError } from "./errors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import offlineJson from "../../config/models.offline.json";
import { createOfflineClient, loadOfflineConfig } from "../../src/llm/offline";
import { Pipeline, type Options } from "./pipeline";
import { createDemoClient } from "./demo";

const help = {
  cards: "起草字卡：npm run content:cards -- <content/lessons/课程.json> [--fake]。已有字卡全部跳过。",
  passage: "起草短文：npm run content:passage -- --chars 休,森,采 --topic 足球 --known content/known-chars/3-upper.txt [--id 唯一编号] [--fake]。",
  check: "代码检查：npm run content:check。检查draft及reviewed，记录内容指纹、超纲字和问题，不改审批状态；不通过时退出码为1。",
  review: "模型挑错：npm run content:review -- [--fake]。只审校通过当前代码检查的draft课程、字卡和短文，写_review并变为reviewed；不会改正文。",
  sheet: "人工审核表：npm run content:sheet -- [--date YYYY-MM-DD]。收集reviewed内容，输出到content/review/日期.md。",
  approve: "人工批准：npm run content:approve -- <文件...>。仅批准当前check与独立review通过、无问题的reviewed内容；字卡source须人工填写。approved不覆盖。",
} as const;
type Command = keyof typeof help;
export async function runCli(args: string[], deps: { root?: string; log?: (text: string) => void; now?: () => Date; options?: Options } = {}): Promise<number> {
  const log = deps.log ?? console.log;
  const command = args[0] as Command;
  if (!Object.hasOwn(help, command)) throw new ContentError("命令应为 cards、passage、check、review、sheet 或 approve。");
  if (args.includes("--help") || args.includes("-h")) { log(help[command] + "\n仅用于离线公开课程；--fake使用编造样例假客户端，绝不联网，不能替代真实审校。"); return 0; }
  const flags: Record<string, string> = {};
  const files: string[] = [];
  let fake = false;
  const allowed: Record<Command, string[]> = { cards: [], passage: ["--chars", "--topic", "--known", "--id"], check: [], review: [], sheet: ["--date"], approve: [] };
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--fake") { fake = true; continue; }
    if (arg.startsWith("--")) {
      if (!allowed[command].includes(arg) || !args[i + 1] || args[i + 1]!.startsWith("--")) throw new ContentError("参数不正确，请用--help查看用法。");
      flags[arg] = args[++i]!;
    } else files.push(arg);
  }
  if (command !== "cards" && command !== "approve" && files.length) throw new ContentError("多余的文件参数，请用--help查看用法。");
  const config = loadOfflineConfig(offlineJson);
  const options: Options = deps.options ?? { root: deps.root ?? path.resolve("content"), providers: { draft: config.draft.provider, review: config.review.provider } };
  if (!deps.options && (command === "cards" || command === "passage" || command === "review")) {
    const role = command === "review" ? "review" : "draft";
    if (fake) { options.providers = { draft: "openai", review: "deepseek" }; options[role] = createDemoClient(role); }
    else options[role] = createOfflineClient({ role, fetch: globalThis.fetch, getEnv: name => process.env[name], now: () => Date.now() });
  }
  const pipeline = new Pipeline(options);
  return pipeline.locked(async () => {
    if (command === "cards") {
      if (files.length !== 1) throw new ContentError("请提供一个课程文件。");
      log(`新建字卡：${(await pipeline.cards(files[0]!)).length}张。`);
    } else if (command === "passage") {
      if (!flags["--chars"] || !flags["--topic"] || !flags["--known"]) throw new ContentError("缺少--chars、--topic或--known。");
      log(await pipeline.passage({ chars: flags["--chars"].split(","), topic: flags["--topic"], knownFile: flags["--known"], id: flags["--id"] ?? `story-${(deps.now?.() ?? new Date()).toISOString().replace(/[^0-9]/g, "")}` }));
    } else if (command === "check") {
      const results = await pipeline.check();
      log(JSON.stringify(results, null, 2));
      if (results.some(result => result.issues.length)) return 1;
    } else if (command === "review") {
      const results = await pipeline.review(); log(JSON.stringify(results, null, 2));
      if (results.some(result => result.issues.length)) return 1;
    } else if (command === "sheet") log(await pipeline.sheet(flags["--date"] ?? (deps.now?.() ?? new Date()).toISOString().slice(0, 10)));
    else log(`已批准：${(await pipeline.approve(files)).length}条。`);
    return 0;
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch((error: unknown) => { if (error instanceof ContentError) console.error(error.message); console.error("内容命令未完成，请核对参数、JSON结构、检查与审校状态以及离线模型配置。使用--help查看说明。具体检查问题见_check或_review；不会输出密钥或模型原始响应。"); process.exitCode = 1; });
}
