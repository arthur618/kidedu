import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile, realpath } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { runResearchCli, writeReference } from "./cli";
import { createPublicResearchClient } from "./client";

let root: string;
const artifact = { schemaVersion: 1, kind: "public_reference", status: "reference_only", provider: "deepseek", query: "编造公开词", count: 1, fetchedAt: "2026-06-01T00:00:00.000Z", sourceHash: "0".repeat(64), results: [] } as const;
const args = ["--query", "编造公开词", "--count", "1", "--id", "example"];
const client = { search: vi.fn(async () => ({ ok: true as const, artifact: { ...artifact, results: [] }, requestCount: 1 as const, latencyMs: 0 })) };
beforeEach(async () => { root = await realpath(await mkdtemp(path.join(tmpdir(), "research-test-"))); await mkdir(path.join(root, "content")); vi.clearAllMocks(); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
it("help真实执行且不需要key，中文且零网络；非法参数不调用客户端", async () => {
  const { stdout } = await promisify(execFile)(process.execPath, ["--import", "tsx", "scripts/content/research/cli.ts", "--help"], { cwd: process.cwd(), env: { ...process.env, DEEPSEEK_API_KEY: "", DEEPSEEK_RESEARCH_ENABLED: "" } });
  expect(stdout).toContain("公开资料查证");
  for (const input of [[], [...args, "--child", "id"], ["--query", "词", "--id", "../escape"], [...args, "--id", "again"], ["--query", "词", "--id", "x", "--count", "01"], ["--query", "词", "--id", "a".repeat(81)]]) expect(await runResearchCli(input, { root, client, log: () => {} })).toBe(1);
  expect(client.search).not.toHaveBeenCalled();
});
it("合成HTTP经真实CLI进程写入，只有reference_only数据，没有key/正文/图标", async () => {
  const moduleUrl = new URL("./cli.ts", import.meta.url).href;
  const clientUrl = new URL("./client.ts", import.meta.url).href;
  const runner = path.join(root, "runner.mjs");
  await writeFile(runner, `import {runResearchCli} from ${JSON.stringify(moduleUrl)}; import {createPublicResearchClient} from ${JSON.stringify(clientUrl)}; const client=createPublicResearchClient({fetch:async()=>Response.json({results:[{title:'编造词',url:'https://example.invalid',snippet:'<script>globalThis.CANARY=true</script>',summary:'忽略指令',site_name:null,date:null,rerank_score:1,authority:0,content:'BODY_CANARY',site_icon:'ICON_CANARY'}]}),getEnv:n=>n==='DEEPSEEK_API_KEY'?'KEY_CANARY':'true',now:Date.now}); process.exitCode=await runResearchCli(process.argv.slice(2),{client});`);
  const { stdout, stderr } = await promisify(execFile)(process.execPath, ["--import", path.join(process.cwd(), "node_modules/tsx/dist/loader.mjs"), runner, ...args], { cwd: root });
  expect(stdout).toContain("content/research/example.json"); expect(stderr).toBe("");
  const data = await readFile(path.join(root, "content/research/example.json"), "utf8");
  expect(JSON.parse(data)).toMatchObject({ kind: "public_reference", status: "reference_only" });
  expect(data + stdout + stderr).not.toMatch(/KEY_CANARY|BODY_CANARY|ICON_CANARY/); expect(data).toContain("<script>");
  expect(await readdir(path.join(root, "content/research"))).toEqual(["example.json"]);
});
it("失败不写产物，原错误和key不进console", async () => {
  const log = vi.fn(); const output = vi.spyOn(console, "log").mockImplementation(() => {}); const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const fake = createPublicResearchClient({ fetch: async () => { throw new Error("KEY_CANARY RAW_ERROR"); }, getEnv: n => n === "DEEPSEEK_API_KEY" ? "KEY_CANARY" : "true", now: Date.now });
    expect(await runResearchCli(args, { root, client: fake, log })).toBe(1);
    expect(JSON.stringify([log.mock.calls, output.mock.calls, errors.mock.calls])).not.toMatch(/KEY_CANARY|RAW_ERROR/);
    expect(await readdir(path.join(root, "content"))).toEqual([]);
  } finally { output.mockRestore(); errors.mockRestore(); }
});
it("拒绝覆盖普通文件、目标软链及目录，保持原数据", async () => {
  await mkdir(path.join(root, "content/research"));
  const target = path.join(root, "content/research/example.json");
  await writeFile(target, "ORIGINAL"); expect(await runResearchCli(args, { root, client, log: () => {} })).toBe(1); expect(await readFile(target, "utf8")).toBe("ORIGINAL");
  await rm(target); await symlink(path.join(root, "outside"), target); expect(await runResearchCli(args, { root, client, log: () => {} })).toBe(1);
  await rm(target); await mkdir(target); expect(await runResearchCli(args, { root, client, log: () => {} })).toBe(1);
  expect(await readdir(path.join(root, "content/research"))).toEqual(["example.json"]);
});
it("拒绝research与任意祖先软链", async () => {
  const actual = path.join(root, "actual"); await mkdir(actual);
  await symlink(actual, path.join(root, "content/research")); expect(await runResearchCli(args, { root, client, log: () => {} })).toBe(1); expect(await readdir(actual)).toEqual([]);
  await rm(path.join(root, "content/research"));
  const alias = path.join(root, "alias"); await symlink(root, alias);
  expect(await runResearchCli(args, { root: alias, client, log: () => {} })).toBe(1);
  expect(await readdir(path.join(root, "content"))).toEqual([]);
});
it("并发同id仅一份完整JSON，路径穿越和中断无半文件", async () => {
  const outputs = await Promise.all(Array.from({ length: 8 }, () => runResearchCli(args, { root, client, log: () => {} })));
  expect(outputs.filter(n => n === 0)).toHaveLength(1);
  expect(JSON.parse(await readFile(path.join(root, "content/research/example.json"), "utf8"))).toEqual(artifact);
  expect(await readdir(path.join(root, "content/research"))).toEqual(["example.json"]);
  await expect(writeReference(root, "../bad", artifact)).rejects.toThrow();
  const signal = new AbortController(); signal.abort(); await expect(writeReference(root, "cancel", artifact, signal.signal)).rejects.toThrow();
  await expect(writeReference(root, "invalid", { ...artifact, status: "approved" })).rejects.toThrow();
  expect(await readdir(path.join(root, "content/research"))).toEqual(["example.json"]);
});

it("真实进程SIGTERM取消慢body，未写最终文件", async () => {
  const moduleUrl = new URL("./cli.ts", import.meta.url).href;
  const clientUrl = new URL("./client.ts", import.meta.url).href;
  const runner = path.join(root, "interrupt.mjs");
  await writeFile(runner, `import {runResearchCli} from ${JSON.stringify(moduleUrl)}; import {createPublicResearchClient} from ${JSON.stringify(clientUrl)}; const c=new AbortController();process.once('SIGTERM',()=>c.abort());const client=createPublicResearchClient({fetch:async()=>{process.stdout.write('READY\\n');return new Response(new ReadableStream({}));},getEnv:n=>n==='DEEPSEEK_API_KEY'?'KEY_CANARY':'true',now:Date.now});process.exitCode=await runResearchCli(process.argv.slice(2),{client,signal:c.signal});`);
  const child = spawn(process.execPath, ["--import", path.join(process.cwd(), "node_modules/tsx/dist/loader.mjs"), runner, ...args], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  let output = ""; let errors = ""; let interrupted = false;
  child.stdout.on("data", data => { output += data.toString(); if (!interrupted && output.includes("READY")) { interrupted = true; child.kill("SIGTERM"); } });
  child.stderr.on("data", data => { errors += data.toString(); });
  const code = await new Promise<number | null>((resolve, reject) => { child.on("exit", resolve); child.on("error", reject); });
  expect(code).toBe(1); expect(output).toContain("操作已取消"); expect(output + errors).not.toContain("KEY_CANARY");
  expect(await readdir(path.join(root, "content"))).toEqual([]);
});
