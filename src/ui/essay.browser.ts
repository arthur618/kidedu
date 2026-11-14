import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { database, harness } from "../../tests/integration/helpers";
import { setup, topic, essayText } from "../../tests/integration/essay/helpers";
import { getEssayRuntime } from "../db/essayRuntime";
import { getPrisma } from "../db/client";
let db: Awaited<ReturnType<typeof database>>; let server: Server; let origin: string; let h: ReturnType<typeof harness>; let id: string;
test.beforeAll(async () => {
 db=await database(); server=createServer(async(incoming,outgoing)=>{
  try {
   const chunks: Buffer[]=[]; for await(const chunk of incoming) chunks.push(Buffer.from(chunk));
   const url=new URL(incoming.url!,"http://localhost");const path=url.pathname.split("/").filter(Boolean);
   const request=new Request(url,{method:incoming.method,headers:incoming.headers as Record<string,string>,...(incoming.method==="GET"?{}:{body:Buffer.concat(chunks).toString()})});
   const result=incoming.method==="GET"?await h.handlers().get(path[2]!):await h.handlers().post(path.length===2?"start":path[3] as "event"|"homework"|"essay",request,path[2]);
   outgoing.writeHead(result.status,Object.fromEntries(result.headers));outgoing.end(await result.text());
  }catch{outgoing.writeHead(500);outgoing.end("unavailable");}
 });await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
test.afterAll(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await db.cleanup();});
for(const size of [{width:375,height:667},{width:1024,height:768}]) {
 test(`C10 默认入口真实UI→handler→SQLite→Essay/护栏完整闭环 ${size.width}`,async({page})=>{
  h=await setup(); const replies:string[]=[];const logs:string[]=[];page.on("console",m=>logs.push(m.text()));await page.setViewportSize(size);
  await page.route("**/api/session**",async route=>{
   const req=route.request();const url=new URL(req.url());const response=await route.fetch({url:origin+url.pathname+url.search});const body=await response.text();replies.push(body);
   if(req.method()==="POST"&&url.pathname==="/api/session") {expect(req.postDataJSON().hasEssayToday).toBe(false);id=JSON.parse(body).sessionId;expect((await h.deps.getSessionRuntime(id))?.context.hasEssayToday).toBe(false);}
   await route.fulfill({response,body});
  });
  await page.goto("/learn?childId=child-test-1&lessonId=c7-lesson");await page.getByRole("button",{name:"我来说",exact:true}).click();await page.getByLabel("今天要做什么？").fill(topic);await page.getByRole("button",{name:"好了，给你看看",exact:true}).click();await page.getByRole("button",{name:"对的，开始",exact:true}).click();
  await expect(page.getByRole("heading",{name:"收集你的好想法",exact:true})).toBeVisible();expect((await h.deps.getSessionRuntime(id))?.context.hasEssayToday).toBe(true);
  for(let i=0;i<5;i++){await page.getByLabel("我的想法",{exact:true}).fill(`编造原话${i+1}`);await page.getByRole("button",{name:"把这个想法留下",exact:true}).focus();await page.keyboard.press("Enter"); if(i<4) await expect(page.getByLabel("我的想法",{exact:true})).toHaveValue("");}
  await expect(page.getByRole("heading",{name:"你的想法小卡片",exact:true})).toBeVisible();await page.getByLabel("我自己写的文章",{exact:true}).fill(essayText);
  await page.getByRole("button",{name:"已选这个想法",exact:true}).first().click();await expect(page.getByRole("button",{name:"选这个想法",exact:true})).toHaveAttribute("aria-pressed","false");await expect(page.getByLabel("我自己写的文章",{exact:true})).toHaveValue(essayText);
  await page.getByRole("button",{name:"删除想法：编造原话2",exact:true}).click();await expect(page.getByText("编造原话2",{exact:true})).toHaveCount(0);await expect(page.getByLabel("我自己写的文章",{exact:true})).toHaveValue(essayText);
  await page.getByLabel("我自己写的文章",{exact:true}).fill(" ");await page.getByRole("button",{name:"给小问号读一读",exact:true}).click();await expect(page.getByRole("status")).toHaveText("写下一点自己的话，再给小问号看看吧。");await page.getByLabel("我自己写的文章",{exact:true}).fill(essayText);
  for(const button of await page.locator(".child-app").getByRole("button").all()) expect(await button.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(56);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.getByRole("button",{name:"给小问号读一读",exact:true}).click();await expect(page.getByRole("heading",{name:"一起看看你的文章",exact:true})).toBeVisible();
  const activity=(await getEssayRuntime(id))!;expect(activity.utterances).toHaveLength(5);expect(activity.cards).toHaveLength(4);expect(activity.cards[0]!.selected).toBe(false);expect(activity.essayText).toBe(essayText);
  const privateMarker="虚构尾段只在私有表保存";expect(await page.content()).not.toContain(privateMarker);expect(JSON.stringify(replies)).not.toContain(privateMarker);expect(JSON.stringify(logs)).not.toContain(privateMarker);expect(JSON.stringify(await getPrisma().turn.findMany())).not.toContain(privateMarker);expect(JSON.stringify(await getPrisma().sessionCommand.findMany())).not.toContain(privateMarker);
  await page.getByRole("button",{name:"先写到这里",exact:true}).click();await expect(page.getByRole("heading",{name:"今天的小收获",exact:true})).toBeVisible();expect((await getEssayRuntime(id))?.phase).toBe("complete");await page.getByRole("button",{name:"开心",exact:true}).click();await expect(page.getByText("今天辛苦啦，去休息吧。",{exact:true})).toBeVisible();
 });
 test(`C10 真实入口提前结束与随时退出 ${size.width}`,async({page})=>{
  h=await setup();await page.setViewportSize(size);await page.route("**/api/session**",async route=>{const req=route.request();const url=new URL(req.url());const response=await route.fetch({url:origin+url.pathname});const body=await response.text();if(url.pathname==="/api/session")id=JSON.parse(body).sessionId;await route.fulfill({response,body});});
  await page.goto("/learn?childId=child-test-1&lessonId=c7-lesson");await page.getByRole("button",{name:"我来说",exact:true}).click();await page.getByLabel("今天要做什么？").fill(topic);await page.getByRole("button",{name:"好了，给你看看",exact:true}).click();await page.getByRole("button",{name:"对的，开始",exact:true}).click();
  await page.getByRole("button",{name:"这些够了",exact:true}).click();await expect(page.getByText("还没有小卡片，也可以自己写。",{exact:true})).toBeVisible();await page.getByRole("button",{name:"今天先到这",exact:true}).focus();await page.keyboard.press("Enter");await expect(page.getByRole("heading",{name:"今天的小收获",exact:true})).toBeVisible();expect((await getEssayRuntime(id))?.phase).toBe("abandoned");await page.getByRole("button",{name:"今天先到这",exact:true}).click();await expect(page.getByText("今天辛苦啦，去休息吧。",{exact:true})).toBeVisible();
 });
}
