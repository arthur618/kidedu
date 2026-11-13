import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { LlmClient, LlmRequest, LlmResult } from "../../src/contracts/llm";
import { Pipeline, type Options } from "./pipeline";
import { demoCards, demoBody, createDemoClient } from "./demo";
import { fingerprint, han, type Document } from "./checks";
import { runCli } from "./cli";

let root: string;
let pipeline: Pipeline;
let options: Options;
const file = (kind: string, name: string) => path.join(root, kind, `${name}.json`);
const read = async (where: string): Promise<Document> => JSON.parse(await fs.readFile(where, "utf8"));
const write = async (where: string, doc: Document) => { await fs.mkdir(path.dirname(where), { recursive: true }); await fs.writeFile(where, JSON.stringify(doc)); };
const lesson = () => ({ id: "demo", grade: 3, term: "upper", lessonNo: 1, title: "虚构练习", recognizeChars: demoCards.map(card => card.char), writeChars: ["休", "休"], words: ["休息"], status: "draft" });
const fakeReview = (issues: string[]): LlmClient => ({ async call<T>(request: LlmRequest<T>): Promise<LlmResult<T>> { return { ok: true, data: request.schema.parse({ issues }), model: "fake", inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, latencyMs: 0 }; } });
async function draft(source = "人工核验测试出处（编造，不代表真实依据）") {
  const where = file("cards", "休");
  await write(where, { ...demoCards[0]!, source, _draft: { provider: "openai" } });
  return where;
}
beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "c4-test-")));
  options = { root, draft: createDemoClient("draft"), review: fakeReview([]), providers: { draft: "openai", review: "deepseek" } };
  pipeline = new Pipeline(options);
});
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });
describe("离线内容工作流", () => {
  it("人工Lesson须先check再review，只挑录入问题；批准闭环不需要伪造起草厂商", async () => {
    const where = file("lessons", "demo"); await write(where, lesson());
    await expect(pipeline.approve([where])).rejects.toThrow("已审校");
    await expect(pipeline.review()).rejects.toThrow("代码检查");
    await pipeline.check(); const before = await read(where); await pipeline.review();
    expect(await read(where)).toMatchObject({ ...before, status: "reviewed", _review: { origin: "manual_lesson", issues: [] } });
    expect(await pipeline.approve([where])).toEqual([where]);
    expect((await read(where)).status).toBe("approved");
  });
  it("人工Lesson无起草厂商，配置同厂商也能审阅录入一致性；正文变动使旧审核失效", async () => {
    const where = file("lessons", "demo"); await write(where, lesson());
    const review = fakeReview([]); const call = vi.spyOn(review, "call");
    const manual = new Pipeline({ ...options, providers: { draft: "deepseek", review: "deepseek" }, review });
    await manual.check(); const before = await read(where); await manual.review();
    expect(call.mock.calls[0]?.[0].system).toContain("不能凭模型判断教材真实性");
    expect(call.mock.calls[0]?.[0].system).toContain("不补字词");
    const after = await read(where);
    const { status: _s, _review: _r, ...body } = after;
    const { status: _beforeStatus, ...original } = before;
    expect(body).toEqual(original);
    await write(where, { ...after, title: "修正后的课程名" }); await manual.check();
    await expect(manual.approve([where])).rejects.toThrow("独立审校");
    await write(where, { ...await read(where), status: "draft" });
    await manual.check(); await manual.review(); await manual.approve([where]);
    const bytes = await fs.readFile(where);
    await pipeline.cards(where); await manual.check(); await manual.review(); await manual.sheet("2026-11-13"); await manual.approve([where]);
    expect(await fs.readFile(where)).toEqual(bytes);
  });
  it("人工Lesson审阅问题阻止批准；修改或缺少manual_lesson来源不能沿用凭据", async () => {
    const where = file("lessons", "demo"); await write(where, lesson()); await pipeline.check();
    await new Pipeline({ ...options, review: fakeReview(["请人工核对课程编号"]) }).review();
    await expect(pipeline.approve([where])).rejects.toThrow("独立审校");
    await write(where, { ...await read(where), status: "draft" }); await pipeline.review();
    const doc = await read(where); const review = { ...doc._review as Record<string, unknown> }; delete review.origin;
    await write(where, { ...doc, _review: review });
    await expect(pipeline.approve([where])).rejects.toThrow("独立审校");
  });
  it("已批准短文经过检查、审阅、清单和重复批准后保持特殊排版原字节", async () => {
    const known = path.join(root, "known.txt"); await fs.writeFile(known, [...new Set(han(demoBody))].join("\n"));
    const where = await pipeline.passage({ chars: ["休"], topic: "游戏", knownFile: known, id: "story" });
    await pipeline.check(); await pipeline.review(); await pipeline.approve([where]);
    await fs.writeFile(where, JSON.stringify(await read(where), null, 4) + "\n\n");
    const bytes = await fs.readFile(where);
    await pipeline.check(); await pipeline.review(); await pipeline.sheet("2026-11-13"); await pipeline.approve([where]);
    expect(await fs.readFile(where)).toEqual(bytes);
  });
  it("课程去重后减去已有字卡；所有已有状态均不覆盖；草稿出处为空音频null", async () => {
    const input = file("lessons", "demo"); await write(input, lesson());
    const existing = file("cards", "休"); await write(existing, { ...demoCards[0]!, status: "approved" });
    const before = await fs.readFile(existing, "utf8");
    const created = await pipeline.cards(input);
    expect(created).toHaveLength(5);
    expect(await fs.readFile(existing, "utf8")).toBe(before);
    expect(await pipeline.cards(input)).toEqual([]);
    for (const name of created) expect(await read(name)).toMatchObject({ source: "", status: "draft", audioUrl: null });
  });
  it("短文从已知字快照生成，覆盖全部目标字，不能重用已有编号", async () => {
    const known = path.join(root, "known.txt"); await fs.writeFile(known, [...new Set(han(demoBody))].join("\n"));
    const input = { chars: ["休", "森", "采", "休"], topic: "游戏", knownFile: known, id: "demo" };
    const where = await pipeline.passage(input);
    expect(await read(where)).toMatchObject({ targetChars: ["休", "森", "采"], outOfScopeCount: 0, status: "draft", sourceType: "original" });
    expect((await pipeline.check())[0]?.issues).toEqual([]);
    const before = await fs.readFile(where, "utf8");
    await expect(pipeline.passage(input)).rejects.toThrow("不能覆盖");
    expect(await fs.readFile(where, "utf8")).toBe(before);
    await expect(pipeline.passage({ ...input, id: "../bad" })).rejects.toThrow("编号");
  });
  it("审校只写_review及状态，不修改正文或其他元数据；记录实际厂商和问题", async () => {
    const where = await draft(); await pipeline.check();
    const before = await read(where);
    pipeline = new Pipeline({ ...options, review: fakeReview(["请核验部首出处"]) });
    expect((await pipeline.review())[0]?.issues).toEqual(["请核验部首出处"]);
    const after = await read(where);
    const { status: _s1, _review: _r1, ...a } = before;
    const { status: _s2, _review: _r2, ...b } = after;
    expect(b).toEqual(a);
    expect(after).toMatchObject({ status: "reviewed", _review: { hash: fingerprint(before), provider: "deepseek", issues: ["请核验部首出处"] } });
    await expect(pipeline.approve([where])).rejects.toThrow("独立审校");
  });
  it("拒绝无check、check失败、未review、空source以及改动后的旧审核凭据", async () => {
    const where = await draft();
    await expect(pipeline.approve([where])).rejects.toThrow("已审校");
    await expect(pipeline.review()).rejects.toThrow("代码检查");
    await pipeline.check();
    await expect(pipeline.approve([where])).rejects.toThrow("已审校");
    await pipeline.review();
    await write(where, { ...await read(where), explain: "正文已被改动。另一句。" });
    await expect(pipeline.approve([where])).rejects.toThrow("代码检查");
    await write(where, { ...await read(where), status: "draft" });
    await pipeline.check(); await pipeline.review();
    await write(where, { ...await read(where), source: "改后的出处" });
    await expect(pipeline.approve([where])).rejects.toThrow("代码检查");
    await draft(""); await pipeline.check(); await pipeline.review();
    await expect(pipeline.approve([where])).rejects.toThrow("source");
    await draft(); await write(where, { ...await read(where), pinyin: "xiu" }); await pipeline.check();
    await expect(pipeline.review()).rejects.toThrow("代码检查");
  });
  it("检查后改文再重跑check，旧review仍失效；known字表及超纲计数也绑定", async () => {
    const where = await draft(); await pipeline.check(); await pipeline.review();
    await write(where, { ...await read(where), source: "新出处" }); await pipeline.check();
    await expect(pipeline.approve([where])).rejects.toThrow("独立审校");
  });
  it("短文known快照或统计被改动后必须重新检查和审校", async () => {
    const known = path.join(root, "known.txt"); await fs.writeFile(known, [...new Set(han(demoBody))].join("\n"));
    const where = await pipeline.passage({ chars: ["休"], topic: "游戏", knownFile: known, id: "scope" });
    await pipeline.check(); await pipeline.review();
    const original = await read(where);
    await write(where, { ...original, outOfScopeCount: 1 });
    await expect(pipeline.approve([where])).rejects.toThrow("代码检查");
    await write(where, { ...original, _knownChars: [...original._knownChars as string[], "龟"] });
    await expect(pipeline.approve([where])).rejects.toThrow("代码检查");
    await pipeline.check(); await expect(pipeline.approve([where])).rejects.toThrow("独立审校");
  });
  it("独立审校拒绝相同厂商、配置切换后与当时起草厂商相同、缺失厂商记录", async () => {
    const where = await draft(); await pipeline.check();
    await expect(new Pipeline({ ...options, providers: { draft: "openai", review: "openai" } }).review()).rejects.toThrow("当时起草相同");
    await expect(new Pipeline({ ...options, providers: { draft: "deepseek", review: "openai" } }).review()).rejects.toThrow("当时起草相同");
    const doc = await read(where); delete doc._draft; await write(where, doc); await pipeline.check();
    await expect(pipeline.review()).rejects.toThrow("缺少起草厂商");
  });
  it("生成、check、review、sheet、approve及重复批准均保持approved逐字节不变", async () => {
    const where = await draft(); await pipeline.check(); await pipeline.review();
    expect(await pipeline.approve([where])).toEqual([where]);
    const before = await fs.readFile(where, "utf8");
    const input = file("lessons", "demo"); await write(input, lesson());
    await pipeline.cards(input); await pipeline.check(); await pipeline.review();
    const sheet = await pipeline.sheet("2026-11-13");
    expect(await fs.readFile(sheet, "utf8")).not.toContain('"char": "休"');
    expect(await pipeline.approve([where])).toEqual([]);
    expect(await fs.readFile(where, "utf8")).toBe(before);
    const storyFile = file("passages", "approved"); await write(storyFile, { status: "approved", arbitrary: "保留原样" });
    const storyBefore = await fs.readFile(storyFile, "utf8");
    await expect(pipeline.passage({ chars: ["休"], topic: "游戏", knownFile: "missing", id: "approved" })).rejects.toThrow("不能覆盖");
    await pipeline.check(); await pipeline.review(); await pipeline.sheet("2026-11-13"); await pipeline.approve([storyFile]);
    expect(await fs.readFile(storyFile, "utf8")).toBe(storyBefore);
  });
  it("批量批准先校验全部；没有凭据的文件不会使前面的文件提前批准", async () => {
    const where = await draft(); await pipeline.check(); await pipeline.review();
    const bad = file("cards", "林"); await write(bad, { ...demoCards[1]! });
    await expect(pipeline.approve([where, bad])).rejects.toThrow();
    expect((await read(where)).status).toBe("reviewed");
  });
  it("拒绝目录外路径和符号链接，锁防止并发命令，异常后释放锁", async () => {
    const where = await draft();
    await fs.symlink(where, file("cards", "链接"));
    await expect(pipeline.check()).rejects.toThrow("符号链接");
    await expect(pipeline.approve([path.join(root, "outside.json")])).rejects.toThrow("指定目录");
    await pipeline.locked(async () => { await expect(pipeline.locked(async () => undefined)).rejects.toThrow("正在运行"); });
    await expect(pipeline.locked(async () => { throw new Error("中断"); })).rejects.toThrow("中断");
    await expect(fs.stat(path.join(root, ".pipeline.lock"))).rejects.toThrow();
  });
  it("假客户端模型失败不会写草稿或提升审批状态", async () => {
    const input = file("lessons", "demo"); await write(input, lesson());
    const failed: LlmClient = { async call() { return { ok: false, error: "provider_error", model: "fake", latencyMs: 0 }; } };
    await expect(new Pipeline({ ...options, draft: failed }).cards(input)).rejects.toThrow("provider_error");
    await expect(fs.stat(file("cards", "休"))).rejects.toThrow();
    const where = await draft(); await pipeline.check();
    await expect(new Pipeline({ ...options, review: failed }).review()).rejects.toThrow("provider_error");
    expect((await read(where)).status).toBe("draft");
  });
});
describe("六个命令入口", () => {
  it.each(["cards", "passage", "check", "review", "sheet", "approve"])("%s --help提供中文说明且不读密钥不调模型", async command => {
    const log = vi.fn();
    expect(await runCli([command, "--help"], { root, log })).toBe(0);
    expect(log.mock.calls[0]?.[0]).toMatch(/[\u4e00-\u9fff]/u);
    await expect(fs.stat(path.join(root, ".pipeline.lock"))).rejects.toThrow();
  });
  it("六命令完整流程全部用假客户端；审核表含完整正文、出处、问题与快照", async () => {
    const log = vi.fn(); const deps = { options, log };
    const input = file("lessons", "demo"); await write(input, lesson());
    expect(await runCli(["cards", input], deps)).toBe(0);
    const known = path.join(root, "known.txt"); await fs.writeFile(known, [...new Set(han(demoBody))].join("\n"));
    expect(await runCli(["passage", "--chars", "休,森,采", "--topic", "游戏", "--known", known, "--id", "demo"], deps)).toBe(0);
    for (const card of demoCards) { const where = file("cards", card.char); await write(where, { ...await read(where), source: "虚构测试出处，非正式教材" }); }
    expect(await runCli(["check"], deps)).toBe(0);
    expect(await runCli(["review"], deps)).toBe(0);
    expect(await runCli(["sheet", "--date", "2026-11-13"], deps)).toBe(0);
    const sheet = await fs.readFile(path.join(root, "review", "2026-11-13.md"), "utf8");
    expect(sheet).toContain(demoBody); expect(sheet).toContain("虚构测试出处"); expect(sheet).toContain('"_knownChars"'); expect(sheet).toContain('"issues": []');
    expect(await runCli(["approve", ...demoCards.map(card => file("cards", card.char)), file("passages", "demo"), input], deps)).toBe(0);
    expect((await read(file("passages", "demo"))).status).toBe("approved");
  });
  it("check和review发现问题返回失败退出码；拒绝错参数", async () => {
    const where = await draft(); await write(where, { ...await read(where), pinyin: "xiu" });
    expect(await runCli(["check"], { options, log: vi.fn() })).toBe(1);
    await draft(); await pipeline.check();
    expect(await runCli(["review"], { options: { ...options, review: fakeReview(["待核验"]) }, log: vi.fn() })).toBe(1);
    await expect(runCli(["cards", "--unknown"], { options })).rejects.toThrow("参数");
  });
});
