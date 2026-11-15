import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { database } from "../../tests/integration/helpers";
import { ENV, PASSWORD, daily, seedParent } from "../../tests/integration/parent/fixtures";
import { createParentHandler } from "../server/parent/http";
import { getPrisma } from "../db/client";
let db: Awaited<ReturnType<typeof database>>; let server: Server; let origin: string; let env: Record<string, string | undefined>;
const replies: string[] = [];
test.beforeAll(async () => {
  db = await database();
  const handler = createParentHandler({ getEnv: () => env });
  // 仅重定向测试网络：页面与生产handler保持原同源URL/Origin/cookie；配置来自测试工厂。
  server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Buffer[] = []; for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const base = String(incoming.headers["x-parent-test-origin"]);
      const request = new Request(new URL(incoming.url!, base), { method: incoming.method, headers: incoming.headers as Record<string, string>, ...(incoming.method === "GET" ? {} : { body: Buffer.concat(chunks).toString() }) });
      const response = await handler(request); const text = await response.text(); replies.push(text);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(text);
    } catch { outgoing.writeHead(500); outgoing.end('{"error":"测试连接暂不可用。"}'); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.beforeEach(async () => { env = { ...ENV }; replies.length = 0; await seedParent(); });
test.afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await db.cleanup(); });
async function routeNetwork(page: Page, delay?: (path: string) => Promise<void>) {
  await page.route("**/api/parent/**", async route => {
    const request = route.request(); const url = new URL(request.url());
    const response = await route.fetch({ url: origin + url.pathname + url.search, headers: { ...request.headers(), "x-parent-test-origin": url.origin } });
    await delay?.(url.pathname + url.search);
    await route.fulfill({ response }).catch(() => {}); // 页面取消旧请求时，此网络响应不能写入新状态。
  });
}
async function signIn(page: Page) {
  await page.goto("/parent"); await page.getByLabel("家长口令", { exact: true }).fill(PASSWORD); await page.getByRole("button", { name: "登录", exact: true }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByLabel("查看孩子")).toHaveValue("parent-a"); await expect(page.getByText("理解：102", { exact: true })).toBeVisible();
}
for (const size of [{ width: 375, height: 667 }, { width: 1024, height: 768 }]) {
  test(`C11B 真实UI→handler→迁移SQLite：键盘登录/事实零分/分页/复核/预览/切孩子/注销 ${size.width}`, async ({ page }) => {
    const logs: string[] = []; page.on("console", message => logs.push(message.text())); page.on("pageerror", error => logs.push(error.message));
    await routeNetwork(page); await page.setViewportSize(size); await signIn(page);
    await expect(page.getByRole("heading", { name: "家长日报", exact: true })).toBeVisible();
    await expect(page.getByText("复述参考：0 / 3 分", { exact: true })).toBeVisible(); await expect(page.getByText("复述参考：暂不可用", { exact: true })).toBeVisible(); await expect(page.getByText("本日部分历史学习明细缺失，统计可能不完整。", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "模型参考", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "下一页进度", exact: true }).click(); await expect(page.getByRole("button", { name: "返回进度首页", exact: true })).toBeVisible(); await expect(page.locator(".parent-chars li")).toHaveCount(5); await expect(page.getByText("理解：102", { exact: true })).toBeVisible();
    await page.getByLabel("按阶段查看").selectOption("mastered"); await expect(page.locator(".parent-chars li")).toHaveCount(3);
    await page.getByRole("button", { name: "标记为已处理", exact: true }).focus(); await page.keyboard.press("Enter"); await expect(page.getByRole("button", { name: "改为待留意", exact: true })).toBeVisible(); expect(await getPrisma().parentReviewAudit.count()).toBe(1);
    await page.getByRole("button", { name: "预览删除范围", exact: true }).click(); await expect(page.getByText("本次只是只读预览，没有删除数据。", { exact: false })).toBeVisible(); await expect(page.getByText("当前认字进度：105", { exact: true })).toBeVisible(); expect(await getPrisma().childChar.count({ where: { childId: "parent-a" } })).toBe(105);
    await page.getByLabel("查看孩子").selectOption("parent-b"); await expect(page.getByLabel("查看孩子")).toHaveValue("parent-b"); await expect(page.getByText("理解：0", { exact: true })).toBeVisible(); await expect(page.getByText("这个阶段暂无记录。", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const button of await page.locator(".parent-app").getByRole("button").all()) expect(await button.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await page.getByRole("button", { name: "退出登录", exact: true }).focus(); await page.keyboard.press("Enter"); await expect(page.getByLabel("家长口令", { exact: true })).toBeVisible(); await expect(page.getByRole("heading", { name: "学习事实", exact: true })).toHaveCount(0);
    await expect.poll(async () => (await getPrisma().parentAccessSession.findFirst())?.revoked).toBe(true);
    expect(JSON.stringify(replies)).not.toMatch(/PRIVATE|data:image|https:\/\/invalid|不公开原文/); expect(JSON.stringify(logs)).not.toMatch(/PRIVATE|fictional-parent-password|data:image|Prisma/); expect(await getPrisma().turn.count()).toBe(0);
  });
  test(`C11B 默认关闭可用，不显示孩子或技术配置 ${size.width}`, async ({ page }) => {
    env = {}; await routeNetwork(page); await page.setViewportSize(size); await page.goto("/parent");
    await expect(page.getByRole("heading", { name: "家长入口暂未开启", exact: true })).toBeVisible(); await expect(page.getByLabel("家长口令")).toHaveCount(0); expect(await page.content()).not.toMatch(/编造小禾|PARENT_ACCESS_PASSWORD/); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
test("C11B 日报和Incident真实分页、刷新、无日报空态", async ({ page }) => {
  const base = await getPrisma().incident.findUniqueOrThrow({ where: { id: "incident-parent-a" } });
  for (let n = 1; n <= 21; n++) {
    const report = daily("parent-a", `2026-10-${String(n).padStart(2,"0")}`); await getPrisma().nightlyPublication.create({ data: { childId: "parent-a", date: report.date, timezone: report.timezone, data: JSON.stringify(report), jobId: 0 } });
    const id = `page-incident-${String(n).padStart(2,"0")}`; await getPrisma().incident.create({ data: { ...base, id } }); await getPrisma().incidentContext.create({ data: { incidentId: id, childId: "parent-a", sessionId: "s-parent-a" } });
  }
  await getPrisma().nightlyPublication.deleteMany({ where: { childId: "parent-b" } }); await routeNetwork(page); await signIn(page);
  await page.getByRole("button", { name: "下一页日报", exact: true }).click(); await expect(page.getByRole("heading", { name: "学习事实", exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "下一页记录", exact: true }).click(); await expect(page.getByRole("button", { name: "标记为已处理", exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "刷新记录", exact: true }).click(); await expect(page.getByRole("button", { name: "标记为已处理", exact: true })).toHaveCount(20);
  await page.getByLabel("查看孩子").selectOption("parent-b"); await expect(page.getByText("还没有日报。日报准备好后会显示在这里。", { exact: true })).toBeVisible();
});
test("C11B 切孩子、切页、退出时迟到响应不覆盖新状态", async ({ page }) => {
  let active = false; let held = false; let release!: () => void; let arrived!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; }); const signal = new Promise<void>(resolve => { arrived = resolve; });
  await routeNetwork(page, async path => { if (active && !held && path.includes("parent-a/progress?stage=understand")) { held = true; arrived(); await wait; } });
  await signIn(page); active = true; await page.getByLabel("按阶段查看").selectOption("understand"); await signal;
  await page.getByLabel("查看孩子").selectOption("parent-b"); await expect(page.getByText("理解：0", { exact: true })).toBeVisible(); release(); await expect(page.getByText("理解：102", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "退出登录", exact: true }).click(); await expect(page.getByLabel("家长口令")).toBeVisible(); await expect(page.locator(".parent-chars li")).toHaveCount(0);
});
test("C11B 注销后的晚到日报响应保持登录空态", async ({ page }) => {
  let active = false; let held = false; let release!: () => void; let arrived!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; }); const signal = new Promise<void>(resolve => { arrived = resolve; });
  await routeNetwork(page, async path => { if (active && !held && path.endsWith("parent-a/reports")) { held = true; arrived(); await wait; } });
  await signIn(page); active = true; await page.getByRole("button", { name: "刷新记录", exact: true }).click(); await signal; await page.getByRole("button", { name: "退出登录", exact: true }).click(); await expect(page.getByLabel("家长口令")).toBeVisible(); release(); await expect(page.getByRole("heading", { name: "学习事实", exact: true })).toHaveCount(0);
});
test("C11B 翻页晚到响应不覆盖新筛选", async ({ page }) => {
  let held = false; let release!: () => void; let arrived!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; }); const signal = new Promise<void>(resolve => { arrived = resolve; });
  await routeNetwork(page, async path => { if (!held && path.includes("parent-a/progress?cursor=")) { held = true; arrived(); await wait; } });
  await signIn(page); await page.getByRole("button", { name: "下一页进度", exact: true }).click(); await signal; await page.getByLabel("按阶段查看").selectOption("mastered"); await expect(page.locator(".parent-chars li")).toHaveCount(3); release(); await expect(page.locator(".parent-chars li")).toHaveCount(3); await expect(page.getByLabel("按阶段查看")).toHaveValue("mastered");
});
