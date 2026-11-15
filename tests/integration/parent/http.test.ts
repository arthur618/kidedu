import { afterEach, beforeEach, expect, it } from "vitest";
import { database } from "../helpers";
import { getPrisma, disconnectPrisma } from "../../../src/db/client";
import { insertIncident } from "../../../src/db/incident";
import { createParentHandler } from "../../../src/server/parent/http";
import { loadConfig, hash } from "../../../src/server/parent/security";
import { daily, ENV, NOW, PASSWORD, seedParent } from "./fixtures";
let db: Awaited<ReturnType<typeof database>>;
let env: Record<string, string | undefined>; let now: Date; let handler: ReturnType<typeof createParentHandler>;
let cookie = "";
// 每例独立迁移库，尊重LearningOutcome追加约束，不靠删除历史流水重置测试。
afterEach(async () => { await db?.cleanup(); });
beforeEach(async () => { db = await database(); await seedParent(); env = { ...ENV }; now = new Date(NOW); cookie = ""; restart(); });
function restart() { handler = createParentHandler({ getEnv: () => env, now: () => now }); }
function request(path: string, body?: unknown, options: { cookie?: string; origin?: string | null; type?: string; key?: string } = {}) {
  const headers: Record<string, string> = { cookie: options.cookie ?? cookie };
  if (body !== undefined) { headers["content-type"] = options.type ?? "application/json"; if (options.origin !== null) headers.origin = options.origin ?? "http://localhost"; }
  if (options.key) headers["Idempotency-Key"] = options.key;
  return handler(new Request(`http://localhost/api/parent/${path}`, { method: body === undefined ? "GET" : "POST", headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
}
async function signIn() { const response = await request("login", { password: PASSWORD }); expect(response.status).toBe(200); cookie = response.headers.get("set-cookie")!.split(";")[0]!; return response; }
const resource = (path: string, id = "parent-a") => `children/${id}/${path}`;
it("验收1：缺配置默认关闭，公开status仅开关，无任何家庭字段；其他入口403", async () => {
  for (const invalid of [{}, { PARENT_ACCESS_PASSWORD: " ".repeat(24), PARENT_ALLOWED_CHILD_IDS: "parent-a" }, { PARENT_ACCESS_PASSWORD: "short", PARENT_ALLOWED_CHILD_IDS: "parent-a" }, { PARENT_ACCESS_PASSWORD: PASSWORD, PARENT_ALLOWED_CHILD_IDS: "parent-a,," }]) {
    env = invalid; expect(await (await request("status")).json()).toEqual({ enabled: false, authenticated: false });
    for (const path of ["children", resource("reports"), resource("progress"), resource("incidents"), resource("deletion-preview")]) expect((await request(path)).status).toBe(403);
    expect((await request("login", { password: PASSWORD })).status).toBe(403);
  }
});
it("验收1：随机256bit cookie只存hash、生产Secure、24h绝对过期，不滑动续期", async () => {
  env.NODE_ENV = "production"; const response = await signIn(); const header = response.headers.get("set-cookie")!;
  expect(header).toContain("HttpOnly"); expect(header).toContain("SameSite=Strict"); expect(header).toContain("Path=/api/parent"); expect(header).toContain("Secure"); expect(header).toContain("Max-Age=86400");
  const token = cookie.split("=")[1]!; expect(Buffer.from(token, "base64url").length).toBe(32);
  const row = await getPrisma().parentAccessSession.findFirst(); expect(row?.tokenHash).toBe(hash(token)); expect(JSON.stringify(row)).not.toContain(token); expect(JSON.stringify(row)).not.toContain(PASSWORD);
  now = new Date(new Date(NOW).getTime() + 86399999); expect((await request("children")).status).toBe(200);
  now = new Date(new Date(NOW).getTime() + 86400000); expect((await request("children")).status).toBe(401);
  expect(await (await request("status")).json()).toEqual({ enabled: true, authenticated: false });
});
it("验收1：错误/伪造/未登录/退出重放和配置变化全部拒绝", async () => {
  expect((await request("children")).status).toBe(401); expect((await request("login", { password: "wrong" })).status).toBe(401);
  expect((await request("children", undefined, { cookie: `parent_access=${"A".repeat(43)}` })).status).toBe(401);
  await signIn(); const first = cookie; expect((await request("logout", {})).status).toBe(200); expect((await request("children", undefined, { cookie: first })).status).toBe(401);
  await signIn(); env.PARENT_ALLOWED_CHILD_IDS = "parent-a"; expect((await request("children")).status).toBe(401);
  await signIn(); env.PARENT_ACCESS_PASSWORD = PASSWORD + "changed"; expect((await request("children")).status).toBe(401);
});
it("验收1：登录桶持久化，重启/伪造代理IP不能绕过，窗口后可登录", async () => {
  for (let n = 0; n < 8; n++) expect((await request("login", { password: "wrong" })).status).toBe(401);
  await disconnectPrisma(); restart();
  const response = await handler(new Request("http://localhost/api/parent/login", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", "x-forwarded-for": "fake-new-ip" }, body: JSON.stringify({ password: PASSWORD }) })); expect(response.status).toBe(429);
  now = new Date(now.getTime() + 900000); await signIn();
});
it("验收1：所有变更要求同源Origin和JSON，包括登录/退出/人工操作", async () => {
  for (const options of [{ origin: null }, { origin: "https://evil.invalid" }, { type: "text/plain" }]) expect((await request("login", { password: PASSWORD }, options)).status).toBeGreaterThanOrEqual(400);
  await signIn();
  for (const path of ["logout", resource("incidents/incident-parent-a/resolve")]) for (const options of [{ origin: null }, { origin: "http://evil.invalid" }, { type: "text/plain" }]) expect((await request(path, {}, options)).status).toBeGreaterThanOrEqual(400);
  expect((await getPrisma().incident.findUnique({ where: { id: "incident-parent-a" } }))?.resolved).toBe(false);
});
it("验收2：授权前不读取家庭表，公开status只读会话；全部数据路径需登录", async () => {
  for (const path of ["children", resource("progress"), resource("reports"), resource("reports/report-parent-a-2026-11-14"), resource("incidents"), resource("incidents/incident-parent-a"), resource("deletion-preview")]) expect((await request(path)).status).toBe(401);
  expect((await request(resource("incidents/incident-parent-a/resolve"), { resolved: true, expectedRevision: 0 }, { key: "request-unauthenticated" })).status).toBe(401);
});
it("验收2：孩子/日报/事件ID的越权与不存在统一404，列表只有授权孩子", async () => {
  env.PARENT_ALLOWED_CHILD_IDS = "parent-a,parent-b"; await signIn();
  expect((await (await request("children")).json()).children.map((c: { id: string }) => c.id)).toEqual(["parent-a", "parent-b"]);
  for (const id of ["other-child", "missing-child"]) for (const path of ["progress", "reports", "incidents", "deletion-preview"]) expect((await request(resource(path, id))).status).toBe(404);
  for (const path of ["reports/report-other-child-2026-11-14", "reports/report-parent-b-2026-11-14", "reports/missing", "incidents/incident-other-child", "incidents/incident-parent-b", "incidents/missing"]) expect((await request(resource(path))).status).toBe(404);
  for (const id of ["incident-other-child", "incident-parent-b", "missing"]) expect((await request(resource(`incidents/${id}/resolve`), { resolved: true, expectedRevision: 0 }, { key: "cross-child-request" })).status).toBe(404);
});
it("验收3：公开日报从Publication读取，0分与null分开，不读私有Job/step", async () => {
  await signIn(); const response = await request(resource("reports")); const raw = await response.text(); const data = JSON.parse(raw);
  expect(data.reports[0].retellScores[0].result.score).toBe(0); expect(data.reports[0].retellScores[1].result).toBe(null);
  expect(raw).not.toMatch(/PRIVATE|SNAPSHOT|KEYPOINTS|ESSAY/); expect(data.reports[0].facts.learningCoverage).toBe("partial");
  expect(await (await request(resource(`reports/${data.reports[0].id}`))).json()).toEqual(data.reports[0]);
  await getPrisma().nightlyPublication.deleteMany({ where: { childId: "parent-b" } }); expect(await (await request(resource("reports", "parent-b"))).json()).toEqual({ reports: [], nextCursor: null });
});
it.each(["childId", "date", "timezone"])("验收3：公共DTO的%s与已授权行冲突时关闭投影且错误无内部异常", async field => {
  await signIn(); const bad = daily("parent-a"); const value = { ...bad, [field]: field === "childId" ? "other-child" : field === "date" ? "2026-11-13" : "UTC" }; value.facts = { ...bad.facts, [field]: value[field as keyof typeof value] } as typeof bad.facts;
  await getPrisma().nightlyPublication.update({ where: { childId_date_timezone: { childId: "parent-a", date: bad.date, timezone: bad.timezone } }, data: { data: JSON.stringify(value) } });
  const response = await request(resource("reports")); expect(response.status).toBe(500); expect(await response.text()).not.toMatch(/other-child|Prisma|sourceVersion|stack|PRIVATE/);
});
it("验收3：当前进度全阶段counts准确、最多100/页；cursor绑定真实孩子/筛选且不可伪造", async () => {
  await signIn(); const first = await (await request(resource("progress?stage=understand"))).json();
  expect(first.chars.length).toBe(100); expect(first.counts).toEqual({ recognize: 0, understand: 102, write: 0, review_2d: 0, review_7d: 0, mastered: 3 }); expect(first.nextCursor).toBeTruthy();
  const cursor = encodeURIComponent(first.nextCursor); const second = await (await request(resource(`progress?stage=understand&cursor=${cursor}`))).json(); expect(second.chars.length).toBe(2); expect(second.nextCursor).toBe(null); expect(second.counts).toEqual(first.counts);
  for (const path of [resource(`progress?stage=mastered&cursor=${cursor}`), resource(`progress?stage=understand&cursor=${cursor}`, "parent-b"), resource("progress?cursor=forged")]) expect((await request(path)).status).toBe(404);
});
it("验收3：日报/Incident每页20，cursor不能跨资源或孩子，跨页无重复", async () => {
  for (let n = 1; n <= 22; n++) {
    const date = `2026-10-${String(n).padStart(2,"0")}`; const report = daily("parent-a", date); await getPrisma().nightlyPublication.create({ data: { childId: "parent-a", date, timezone: report.timezone, jobId: 0, data: JSON.stringify(report) } });
    await insertIncident({ id: `paged-${String(n).padStart(3,"0")}`, type: "safety", turnId: null, note: "私有内容", resolved: false, createdAt: NOW }, "s-parent-a");
  }
  await signIn();
  for (const name of ["reports", "incidents"]) {
    const first = await (await request(resource(name))).json(); expect(first[name]).toHaveLength(20); const cursor = encodeURIComponent(first.nextCursor);
    const next = await (await request(resource(`${name}?cursor=${cursor}`))).json(); expect(next[name]).toHaveLength(3); expect(next.nextCursor).toBe(null);
    expect(new Set([...first[name], ...next[name]].map((row: { id: string }) => row.id)).size).toBe(23);
    expect((await request(resource(`${name}?cursor=${cursor}`, "parent-b"))).status).toBe(404); expect((await request(resource(`${name === "reports" ? "incidents" : "reports"}?cursor=${cursor}`))).status).toBe(404);
  }
});
it("验收4：可信Session归属同事务保存、未知Session回滚，旧无归属隐藏，矛盾/孤儿Turn隐藏", async () => {
  await expect(insertIncident({ id: "rolled-back", type: "safety", turnId: null, note: "x", resolved: false, createdAt: NOW }, "missing-session")).rejects.toThrow(); expect(await getPrisma().incident.findUnique({ where: { id: "rolled-back" } })).toBe(null);
  for (const [id, childId, sessionId] of [["contradictory", "parent-a", "s-other-child"], ["orphan", "parent-a", "missing-session"]]) { await getPrisma().incident.create({ data: { id: id!, type: "safety", note: "private", resolved: false, createdAt: NOW } }); await getPrisma().incidentContext.create({ data: { incidentId: id!, childId: childId!, sessionId: sessionId! } }); }
  await getPrisma().turn.create({ data: { id: "turn-other", sessionId: "s-other-child", agent: "guard", model: "fake", input: "PRIVATE", output: "PRIVATE", inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, latencyMs: 0, guardVerdict: "blocked", createdAt: NOW } });
  await getPrisma().incident.update({ where: { id: "incident-parent-a" }, data: { turnId: "turn-other" } }); await signIn();
  for (const id of ["unattributed", "contradictory", "orphan", "incident-parent-a"]) { expect((await request(resource(`incidents/${id}`))).status).toBe(404); expect((await request(resource(`incidents/${id}/resolve`), { resolved: true, expectedRevision: 0 }, { key: "untrusted-request" })).status).toBe(404); }
  expect((await (await request(resource("incidents"))).json()).incidents).toHaveLength(0);
});
it("验收4：旧可信Turn可解析归属，事件不返回raw Turn/媒体/自由note/活动全文", async () => {
  await getPrisma().turn.create({ data: { id: "safe-turn", sessionId: "s-parent-a", agent: "reader", model: "fake-reader", input: "PRIVATE-TURN-INPUT", output: "PRIVATE-TURN-OUTPUT", inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, latencyMs: 0, guardVerdict: "blocked", createdAt: NOW } });
  await getPrisma().incident.create({ data: { id: "legacy-trusted", type: "bad_question", turnId: "safe-turn", note: "data:image/png;base64,PRIVATE <script>evil</script> https://media.test/", resolved: false, createdAt: NOW } });
  await signIn(); const response = await request(resource("incidents/legacy-trusted")); const raw = await response.text(); expect(response.status).toBe(200); expect(JSON.parse(raw)).toMatchObject({ childId: "parent-a", sessionId: "s-parent-a", agent: "reader", model: "fake-reader" }); expect(raw).not.toMatch(/PRIVATE|script|data:|https:|input|output/);
});
it("验收4：并发双击/相同ID重放一条审计、指纹与CAS冲突，撤销有审计，同值无伪审计", async () => {
  await signIn(); const path = resource("incidents/incident-parent-a/resolve"); const body = { resolved: true, expectedRevision: 0 }; const key = "review-request-stable-0001";
  const responses = await Promise.all([request(path, body, { key }), request(path, body, { key })]); expect(responses.map(r => r.status)).toEqual([200,200]); expect(await responses[0]!.json()).toEqual(await responses[1]!.json());
  expect(await getPrisma().parentReviewAudit.count()).toBe(1); expect((await request(path, { ...body, resolved: false }, { key })).status).toBe(409); expect((await request(path, body, { key: "another-request-old-cas" })).status).toBe(409);
  expect((await request(path, { resolved: true, expectedRevision: 1 }, { key: "same-value-request-0001" })).status).toBe(200); expect(await getPrisma().parentReviewAudit.count()).toBe(1); expect(await getPrisma().parentReviewRequest.count()).toBe(2);
  expect((await request(path, { resolved: false, expectedRevision: 1 }, { key: "reverse-request-0000001" })).status).toBe(200); const audit = await getPrisma().parentReviewAudit.findMany({ orderBy: { revisionAfter: "asc" } }); expect(audit).toHaveLength(2); expect(audit[1]).toMatchObject({ actor: "parent", revisionBefore: 1, revisionAfter: 2, resolvedBefore: true, resolvedAfter: false });
  const row = await getPrisma().incident.findUnique({ where: { id: "incident-parent-a" } }); expect(row).toMatchObject({ revision: 2, resolved: false });
});
it("验收4：不同请求并发仅一个CAS成功，模型/请求不能指定actor；注销/越权不能写", async () => {
  await signIn(); const path = resource("incidents/incident-parent-a/resolve"); const body = { resolved: true, expectedRevision: 0 };
  expect((await request(path, { ...body, actor: "model" }, { key: "forged-actor-request00" })).status).toBe(400);
  const responses = await Promise.all([request(path, body, { key: "concurrent-request-0001" }), request(path, body, { key: "concurrent-request-0002" })]); expect(responses.map(r => r.status).sort()).toEqual([200,409]);
  await request("logout", {}); expect((await request(path, { resolved: false, expectedRevision: 1 }, { key: "after-logout-request00" })).status).toBe(401); expect(await getPrisma().parentReviewAudit.count()).toBe(1);
});
it("验收4/5：人工复核不改学习/内容；删除预览计数完整只读，无删除接口/隐式清理", async () => {
  await signIn(); const snapshots = async () => JSON.stringify({ chars: await getPrisma().childChar.findMany(), sessions: await getPrisma().session.findMany(), cards: await getPrisma().charCard.findMany() }); const before = await snapshots();
  await request(resource("incidents/incident-parent-a/resolve"), { resolved: true, expectedRevision: 0 }, { key: "preview-review-request" }); expect(await snapshots()).toBe(before);
  const tables = async () => JSON.stringify(await Promise.all([getPrisma().incident.findMany(), getPrisma().incidentContext.findMany(), getPrisma().parentReviewAudit.findMany(), getPrisma().parentReviewRequest.findMany(), getPrisma().nightlyJob.findMany()])); const records = await tables();
  const response = await request(resource("deletion-preview")); const preview = await response.json(); expect(preview).toMatchObject({ childId: "parent-a", executable: false, counts: { Child: 1, ChildChar: 105, Session: 2, Incident: 1, IncidentContext: 1, ParentReviewAudit: 1, ParentReviewRequest: 1, NightlyJob: 1, NightlyStep: 0, NightlyPublication: 1 } }); expect(preview.fingerprint).toMatch(/^[a-f0-9]{64}$/); expect(Object.keys(preview.counts)).toHaveLength(18);
  expect(await tables()).toBe(records); expect(await snapshots()).toBe(before); expect((await request(resource("delete"), {})).status).toBe(404);
});
it("验收7：异常JSON/超长数据只返回安全中文，配置归一化不依赖请求配置", async () => {
  expect(loadConfig({ ...ENV, PARENT_ALLOWED_CHILD_IDS: "parent-b,parent-a,parent-a" })?.fingerprint).toBe(loadConfig(ENV)?.fingerprint);
  const response = await handler(new Request("http://localhost/api/parent/login", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: '{"password": PRIVATE' })); expect(response.status).toBe(400); expect(await response.text()).not.toMatch(/PRIVATE|SyntaxError|password/);
  expect((await request("login", { password: PASSWORD, childIds: ["other-child"] })).status).toBe(400);
});
it("验收2/3：日报私有Session引用越权或孤儿不投影，详情与列表都安全拒绝", async () => {
  await signIn();
  for (const sessionId of ["s-other-child", "missing-session"]) {
    const value = daily("parent-a"); value.retellScores[0]!.sessionId = sessionId;
    await getPrisma().nightlyPublication.update({ where: { childId_date_timezone: { childId: "parent-a", date: value.date, timezone: value.timezone } }, data: { data: JSON.stringify(value) } });
    for (const path of ["reports", `reports/${value.id}`]) { const response = await request(resource(path)); expect(response.status).toBe(500); expect(await response.text()).not.toMatch(/s-other|missing-session|Prisma|Error|stack/); }
  }
});
it("验收4：同值请求也保留指纹，不能换body或方法路径复用同一个请求ID", async () => {
  await signIn(); const path = resource("incidents/incident-parent-a/resolve"); const key = "same-value-stable-key-0001";
  const body = { resolved: false, expectedRevision: 0 }; const first = await request(path, body, { key }); expect(first.status).toBe(200);
  expect((await request(path, body, { key })).status).toBe(200); expect(await getPrisma().parentReviewAudit.count()).toBe(0); expect(await getPrisma().parentReviewRequest.count()).toBe(1);
  expect((await request(path, { ...body, resolved: true }, { key })).status).toBe(409);
  expect((await request(resource("incidents/incident-parent-b/resolve", "parent-b"), body, { key })).status).toBe(409); expect(await getPrisma().parentReviewAudit.count()).toBe(0);
});
it("验收2/4：context正确但引用不存在Turn也隐藏；模型元信息不返回URL或嵌入内容", async () => {
  await signIn(); await getPrisma().incident.update({ where: { id: "incident-parent-a" }, data: { turnId: "missing-turn" } }); expect((await request(resource("incidents/incident-parent-a"))).status).toBe(404);
  await getPrisma().turn.create({ data: { id: "metadata-turn", sessionId: "s-parent-a", agent: "reader", model: "https://private.example/media", input: "PRIVATE", output: "PRIVATE", inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, latencyMs: 0, guardVerdict: "blocked", createdAt: NOW } });
  await getPrisma().incident.update({ where: { id: "incident-parent-a" }, data: { turnId: "metadata-turn" } }); const response = await request(resource("incidents/incident-parent-a")); expect(response.status).toBe(200); expect(await response.text()).not.toMatch(/private.example|PRIVATE|https/);
});
it("验收2：家庭资料表不可用时，关闭/未登录/越权child仍先被正确拒绝", async () => {
  // 只在本测试迁移创建的临时SQLite中临时更名；若先读取家庭资料，必然报500。
  await getPrisma().$executeRaw`ALTER TABLE Child RENAME TO ParentTestUnavailableChild`;
  try {
    env = {}; expect((await request("status")).status).toBe(200); expect((await request(resource("deletion-preview"))).status).toBe(403);
    env = { ...ENV }; for (const path of ["children", resource("reports"), resource("incidents"), resource("progress")]) expect((await request(path)).status).toBe(401);
    await signIn(); expect((await request(resource("reports", "other-child"))).status).toBe(404); expect((await request(resource("deletion-preview", "missing-child"))).status).toBe(404);
  } finally { await getPrisma().$executeRaw`ALTER TABLE ParentTestUnavailableChild RENAME TO Child`; }
});
it("验收5：18类完整私有/学习引用计数、预览无任何业务写入，私有快照不投影", async () => {
  const db = getPrisma(); const sessionId = "s-parent-a";
  await db.sessionRuntime.create({ data: { sessionId, state: "ended", context: "PRIVATE-CONTEXT" } }); await db.coachRuntime.create({ data: { sessionId, data: "PRIVATE-COACH" } }); await db.readingRuntime.create({ data: { sessionId, data: "PRIVATE-READING" } }); await db.essayRuntime.create({ data: { sessionId, data: "PRIVATE-ESSAY", commands: "PRIVATE-COMMANDS" } });
  await db.sessionCommand.create({ data: { scope: "child:parent-a", key: "preview-scope", fingerprint: "abc", kind: "start", sessionId: null, phase: "pending", pending: "PRIVATE-PENDING" } });
  await db.learningOutcome.create({ data: { id: "preview-outcome", sessionId, childId: "parent-a", commandScope: "scope", commandKey: "key", effectIndex: 0, char: "山", kind: "write", stageBefore: "recognize", stageAfter: "understand", result: "wrong", occurredAt: NOW } }); await db.sessionLearningCoverage.create({ data: { sessionId, startedAt: NOW } });
  const job = await db.nightlyJob.findFirstOrThrow({ where: { childId: "parent-a" } }); await db.nightlyStep.create({ data: { jobId: job.id, key: "score", inputFingerprint: "private-step", status: "done", result: "PRIVATE-STEP" } });
  await signIn(); await request(resource("incidents/incident-parent-a/resolve"), { resolved: true, expectedRevision: 0 }, { key: "preview-complete-request" });
  const tables = ["child", "childChar", "session", "turn", "incident", "incidentContext", "sessionRuntime", "coachRuntime", "readingRuntime", "essayRuntime", "sessionCommand", "learningOutcome", "sessionLearningCoverage", "nightlyJob", "nightlyStep", "nightlyPublication", "parentReviewRequest", "parentReviewAudit", "parentAccessSession", "parentLoginLimit"] as const;
  const snapshot = async () => JSON.stringify(await Promise.all(tables.map(table => (db[table] as { findMany(): Promise<unknown> }).findMany()))); const before = await snapshot();
  const response = await request(resource("deletion-preview")); const raw = await response.text(); expect(response.status).toBe(200); expect(raw).not.toContain("PRIVATE"); expect(JSON.parse(raw).counts).toEqual({ Child: 1, ChildChar: 105, Session: 2, Turn: 0, Incident: 1, IncidentContext: 1, SessionRuntime: 1, CoachRuntime: 1, ReadingRuntime: 1, EssayRuntime: 1, SessionCommand: 1, LearningOutcome: 1, SessionLearningCoverage: 1, NightlyJob: 1, NightlyStep: 1, NightlyPublication: 1, ParentReviewRequest: 1, ParentReviewAudit: 1 }); expect(await snapshot()).toBe(before);
});
function delayedLogin(password: string) {
  let finish!: () => void;
  const body = new ReadableStream<Uint8Array>({ start(controller) { finish = () => { controller.enqueue(new TextEncoder().encode(JSON.stringify({ password }))); controller.close(); }; } });
  const response = handler(new Request("http://localhost/api/parent/login", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body, duplex: "half" } as RequestInit));
  return { response, finish };
}
it("F1：真实慢body跨窗口不能倒拨持久桶，耗尽后交替补旧body/新body持续429，重启不绕过", async () => {
  now = new Date("2026-11-15T00:14:59.900Z"); const delayed = [delayedLogin("wrong"), delayedLogin("wrong"), delayedLogin("wrong")];
  now = new Date("2026-11-15T00:15:00.100Z");
  for (let n = 0; n < 8; n++) expect((await request("login", { password: "wrong" })).status).toBe(401);
  expect((await request("login", { password: "wrong" })).status).toBe(429); await disconnectPrisma(); restart();
  for (const pending of delayed) { pending.finish(); expect((await pending.response).status).toBe(429); expect((await request("login", { password: "wrong" })).status).toBe(429); }
  expect(await getPrisma().parentLoginLimit.findUnique({ where: { bucket: "household" } })).toEqual({ bucket: "household", windowStart: "2026-11-15T00:15:00.000Z", attempts: 9 });
  now = new Date("2026-11-15T00:30:00.000Z"); await signIn(); expect((await request("children")).status).toBe(200);
});
it("F1：时钟回退不重置已耗尽桶，实际并发预算最多八次且下一新窗口恢复", async () => {
  now = new Date("2026-11-15T00:15:00.100Z"); const responses = await Promise.all(Array.from({ length: 12 }, () => request("login", { password: "wrong" })));
  expect(responses.filter(response => response.status === 401)).toHaveLength(8); expect(responses.filter(response => response.status === 429)).toHaveLength(4);
  now = new Date("2026-11-15T00:14:59.900Z"); expect((await request("login", { password: PASSWORD })).status).toBe(429);
  expect(await getPrisma().parentLoginLimit.findUnique({ where: { bucket: "household" } })).toMatchObject({ windowStart: "2026-11-15T00:15:00.000Z", attempts: 9 });
  now = new Date("2026-11-15T00:30:00.000Z"); await signIn();
});
it("F1：慢body登录的24小时绝对期从实际签发算起，配置变化不签发旧凭证", async () => {
  now = new Date("2026-11-15T00:14:59.900Z"); const pending = delayedLogin(PASSWORD);
  now = new Date("2026-11-15T00:30:00.000Z"); pending.finish(); const response = await pending.response; expect(response.status).toBe(200); cookie = response.headers.get("set-cookie")!.split(";")[0]!;
  expect((await getPrisma().parentAccessSession.findFirst())?.expiresAt).toBe("2026-11-16T00:30:00.000Z"); now = new Date("2026-11-16T00:30:00.000Z"); expect((await request("children")).status).toBe(401);
  const changed = delayedLogin(PASSWORD); env.PARENT_ACCESS_PASSWORD = PASSWORD + "changed"; changed.finish(); expect((await changed.response).status).toBe(403); expect(await getPrisma().parentAccessSession.count()).toBe(1);
});
