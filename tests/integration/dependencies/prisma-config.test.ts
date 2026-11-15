import { afterAll, beforeAll, expect, it } from "vitest";
import { createRequire } from "node:module";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadConfigFromFile } from "@prisma/config";

const require = createRequire(import.meta.url);
// 从Prisma真正依赖的config位置解析，避免测到另一个直接安装的库副本。
const configRequire = createRequire(require.resolve("@prisma/config"));
const mergePath = configRequire.resolve("deepmerge-ts");
const merge = configRequire("deepmerge-ts") as typeof import("deepmerge-ts");
let root: string;
beforeAll(async () => { root = await realpath(await mkdtemp(path.join(tmpdir(), "c13-config-"))); });
afterAll(async () => { await rm(root, { recursive: true, force: true }); });

it("实际config解析到限定override库，嵌套普通对象和数组仍正确合并", async () => {
  const packagePath = path.resolve(path.dirname(mergePath), "../package.json");
  expect(JSON.parse(await readFile(packagePath, "utf8")).version).toBe("8.0.0");
  const left = { migrations: { path: "migrations", seed: "node seed.mjs" }, flags: ["one"] };
  const right = { migrations: { path: "custom-migrations" }, flags: ["two"] };
  expect(merge.deepmerge(left, right)).toEqual({ migrations: { path: "custom-migrations", seed: "node seed.mjs" }, flags: ["one", "two"] });
  expect(left.migrations.path).toBe("migrations"); expect(left.flags).toEqual(["one"]);
});
it("循环对象图有界完成，保留循环结构而非栈溢出", () => {
  // 独立进程硬限5秒，坏依赖不能在主测试进程无限循环。
  const script = `const {deepmerge}=require(${JSON.stringify(mergePath)});const a={value:1};a.self=a;const b={value:2};b.self=b;const out=deepmerge(a,b);process.stdout.write(JSON.stringify({value:out.value,cyclic:out.self===out}));`;
  expect(JSON.parse(execFileSync(process.execPath, ["-e", script], { timeout: 5000, encoding: "utf8" }))).toEqual({ value: 2, cyclic: true });
});
it("准确覆盖v8的Map深合并和Into不再改写独立来源对象", () => {
  const map = merge.deepmerge(new Map([["item", { first: 1 }]]), new Map([["item", { second: 2 }]]));
  expect(map.get("item")).toEqual({ first: 1, second: 2 });
  const first = { nested: { values: [1] } }; const second = { nested: { values: [2] } }; const target = {};
  merge.deepmergeInto(target, first, second);
  expect(target).toEqual({ nested: { values: [1, 2] } }); expect(first).toEqual({ nested: { values: [1] } }); expect(second).toEqual({ nested: { values: [2] } });
});
it("真实Prisma config加载与CLI validate通过纯对象配置，输入仅临时SQLite", async () => {
  const schema = path.join(root, "schema.prisma"); const configFile = path.join(root, "prisma.config.mjs");
  await writeFile(schema, 'datasource db {\n provider = "sqlite"\n url = "file:./temporary.db"\n}\nmodel Sample {\n id String @id\n}\n');
  await writeFile(configFile, 'export default {schema:"./schema.prisma",migrations:{path:"./migrations",seed:"node invented-seed.mjs"},engine:"classic",datasource:{url:"file:./temporary.db"}};\n');
  const loaded = await loadConfigFromFile({ configFile, configRoot: root });
  expect(loaded.error).toBeUndefined(); expect(loaded.config).toMatchObject({ schema, migrations: { path: path.join(root, "migrations"), seed: "node invented-seed.mjs" }, engine: "classic", datasource: { url: "file:./temporary.db" } });
  const output = execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), "validate", "--config", configFile], { cwd: root, timeout: 15000, encoding: "utf8", env: { ...process.env, RUST_LOG: undefined } });
  expect(output).toContain("valid");
});
