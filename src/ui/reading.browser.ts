import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { database, harness } from "../../tests/integration/helpers";
import { prepare, canary } from "../../tests/integration/reading/helpers";
import { getPrisma } from "../db/client";
import { getReadingRuntime } from "../db/readingRuntime";
let db: Awaited<ReturnType<typeof database>>;
let server: Server; let origin: string; let h: ReturnType<typeof harness>; let id: string;
test.beforeAll(async () => {
 db = await database();
 server = createServer(async (incoming, outgoing) => {
  try {
   const parts: Buffer[] = []; for await (const part of incoming) parts.push(Buffer.from(part));
   const url = new URL(incoming.url!, "http://localhost"); const path = url.pathname.split("/").filter(Boolean);
   const request = new Request(url, { method: incoming.method, headers: incoming.headers as Record<string,string>, ...(incoming.method === "GET" ? {} : { body: Buffer.concat(parts).toString() }) });
   const handlers = h.handlers();
   const result = incoming.method === "GET" ? path[4] === "card" ? await handlers.card(id, request) : await handlers.get(id) : await handlers.post(path.length === 2 ? "start" : path[3] as "event" | "reading", request, id);
   outgoing.writeHead(result.status, Object.fromEntries(result.headers)); outgoing.end(await result.text());
  } catch { outgoing.writeHead(500); outgoing.end("unavailable"); }
 });
 await new Promise<void>(resolve => server.listen(0,"127.0.0.1",resolve)); origin = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
test.afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await db.cleanup(); });
for (const size of [{ width:375,height:667 }, { width:1024,height:768 }]) test(`C9 真实UI/handler/迁移SQLite/Reader/护栏 ${size.width}`, async ({ page }) => {
 const prepared = await prepare(); h = prepared.h; id = prepared.id;
 // 正常start得到新session，再只在测试server中准备已完成认字的reading_offer上下文。
 const logs: string[] = []; const replies: string[] = []; page.on("console", message => logs.push(message.text()));
 await page.setViewportSize(size);
 await page.route("**/api/session**", async route => {
  const req = route.request(); const url = new URL(req.url());
  const response = await route.fetch({ url: origin + url.pathname + url.search });
  const body = await response.text(); replies.push(body);
  if (req.method() === "POST" && url.pathname === "/api/session") {
   const packet = JSON.parse(body); id = packet.sessionId;
   const runtime = (await h.deps.getSessionRuntime(id))!; await h.deps.saveSessionRuntime({ ...runtime, state: "reading_offer" });
   // 当前状态也从真实GET handler读取，不编造浏览器包。
   const snapshot = await h.handlers().get(id); const text = await snapshot.text(); replies.push(text); await route.fulfill({ status: snapshot.status, headers: Object.fromEntries(snapshot.headers), body: text });
  } else await route.fulfill({ response, body });
 });
 await page.goto("/learn?childId=child-test-1&lessonId=c7-lesson"); await page.getByRole("button", { name:"想读一读",exact:true }).click();
 await expect(page.getByRole("heading",{name:"编造的小山"})).toBeVisible();
 await page.getByLabel("选一个想看的字").fill("山"); await page.getByRole("button",{name:"看看字卡",exact:true}).focus(); await page.keyboard.press("Enter");
 await expect(page.getByRole("complementary",{name:"只读字卡"})).toBeVisible();
 expect(await page.getByRole("button",{name:"看看字卡",exact:true}).evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(56);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.getByRole("button",{name:"我读完了",exact:true}).click(); await expect(page.getByText("你想说说哪一段？",{exact:true})).toBeVisible();
 await page.getByLabel("我想说").fill("我看见了小鸟。"); await page.getByRole("button",{name:"好了，听听我的",exact:true}).click();
 await expect(page.getByText("你从哪里看出来的？",{exact:true})).toBeVisible(); await page.getByLabel("我想说").fill("第二句写了小鸟。"); await page.getByRole("button",{name:"好了，听听我的",exact:true}).click();
 await expect(page.getByRole("heading",{name:"今天的小收获"})).toBeVisible(); expect((await getReadingRuntime(id))?.transcript).toHaveLength(2);
 await page.getByRole("button",{name:"今天先到这",exact:true}).click(); await expect(page.getByText("今天辛苦啦，去休息吧。",{exact:true})).toBeVisible();
 expect(JSON.stringify(replies)).not.toContain(canary); expect(JSON.stringify(logs)).not.toContain(canary); expect(await page.content()).not.toContain(canary); expect(JSON.stringify(await getPrisma().turn.findMany())).not.toContain(canary);
});
