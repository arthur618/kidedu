import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { database, seed, harness, chars, photo } from "../../tests/integration/helpers";
import { getPrisma } from "../db/client";

// 仅测试入口：独立回环 HTTP server 调生产 handler。生产没有假模型开关。
let db: Awaited<ReturnType<typeof database>>;
let server: Server;
let origin: string;
let h: ReturnType<typeof harness>;
test.beforeAll(async () => {
  db = await database(); await seed(); h = harness();
  server = createServer(async (incoming, outgoing) => {
    try {
      const pieces: Buffer[] = []; for await (const chunk of incoming) pieces.push(Buffer.from(chunk));
      const url = new URL(incoming.url!, "http://localhost");
      const path = url.pathname.split("/").filter(Boolean); const id = path[2]; const kind = path[3];
      const request = new Request(`http://localhost${url.pathname}`, { method: incoming.method, headers: incoming.headers as Record<string, string>, ...(incoming.method === "GET" ? {} : { body: Buffer.concat(pieces).toString() }) });
      const result = incoming.method === "GET" ? await h.handlers().get(id!) : await h.handlers().post(path.length === 2 ? "start" : kind as "event" | "homework" | "coach", request, id);
      outgoing.writeHead(result.status, Object.fromEntries(result.headers)); outgoing.end(await result.text());
    } catch { outgoing.writeHead(500); outgoing.end("test_server_unavailable"); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await db.cleanup(); });

test("C7 [24] 真实UI+回环HTTP+生产handler+迁移SQLite+Agent/护栏，仅模型假", async ({ page }) => {
  const ids: string[] = []; const statuses: number[] = [];
  await page.route("**/api/session**", async route => {
    ids.push(route.request().headers()["idempotency-key"]!);
    // 只重定向请求地址；返回内容来自真实网络handler，不在浏览器里编响应。
    const response = await route.fetch({ url: origin + new URL(route.request().url()).pathname });
    statuses.push(response.status()); await route.fulfill({ response });
  });
  await page.goto("/learn?childId=child-test-1&lessonId=c7-lesson");
  await page.getByRole("button", { name: "我来说", exact: true }).click();
  await page.getByLabel("今天要做什么？").fill("读一读自编课文的生字");
  await page.getByRole("button", { name: "好了，给你看看" }).click();
  await page.getByRole("button", { name: "对的，开始" }).click();
  for (const char of chars) {
    await expect(page.locator(".recognize-word mark")).toHaveText(char);
    await page.getByRole("button", { name: "认识", exact: true }).click();
  }
  for (const char of chars) {
    await expect(page.locator(".big-char")).toHaveText(char);
    await page.getByRole("button", { name: "我听完了", exact: true }).click();
    await expect(page.getByText("你能组一个书上的词吗？", { exact: true })).toBeVisible();
    await page.getByLabel("我想说").fill(`${char}字`); await page.getByRole("button", { name: "好了，听听我的" }).click();
    await expect(page.getByText("你能说一句话吗？", { exact: true })).toBeVisible();
    await page.getByLabel("我想说").fill("我想好了一句话。"); await page.getByRole("button", { name: "好了，听听我的" }).click();
  }
  for (let i = 0; i < 3; i++) { await page.getByRole("button", { name: "播放这个词", exact: true }).click(); await page.getByRole("button", { name: "下一个", exact: true }).click(); }
  await page.getByLabel("拍下我写的字", { exact: true }).setInputFiles({ name: "fictional.png", mimeType: "image/png", buffer: Buffer.from(photo.split(",")[1]!, "base64") });
  for (const char of chars.slice(1)) await page.getByRole("region", { name: `对照${char}`, exact: true }).getByRole("button", { name: "一样", exact: true }).click();
  await page.getByRole("button", { name: "我看好了", exact: true }).click();
  await page.getByRole("button", { name: "下次再读", exact: true }).click();
  await page.getByRole("button", { name: "开心", exact: true }).click();
  await expect(page.getByText("今天辛苦啦，去休息吧。", { exact: true })).toBeVisible();
  expect(statuses.every(status => status === 200)).toBe(true); expect(new Set(ids).size).toBe(ids.length); expect(ids.every(id => /^[A-Za-z0-9_-]{16,128}$/.test(id))).toBe(true);
  const records = await getPrisma().childChar.findMany(); expect(records).toHaveLength(4); expect(records.every(record => record.stage === "review_2d")).toBe(true);
  expect(await getPrisma().turn.count()).toBe(h.fake.calls.length);
});
