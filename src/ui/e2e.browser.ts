import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { SessionStateSchema } from "../contracts/orchestrator";
import { createDemoService, demoPacket, demoPhoto } from "./demo";

test("2 点击真实页面走完假服务认字回路，核对事件和图片", async ({ page }) => {
  const calls: string[] = []; const service = createDemoService();
  await page.route("**/api/session**", async route => {
    const path = new URL(route.request().url()).pathname;
    const input = route.request().postDataJSON();
    let packet;
    if (path === "/api/session") { calls.push("start"); packet = await service.start(); }
    else if (path.endsWith("/homework")) { calls.push("homework"); packet = await service.homework(input); }
    else if (path.endsWith("/coach")) { calls.push("coach"); expect(input).toEqual({ char: "山", text: "高山" }); packet = await service.coach(input); }
    else { calls.push(input.type); if (input.type === "recognize_result") expect(input).toEqual({ type: "recognize_result", char: "山", result: "correct", mode: "self_report" }); if (input.type === "dictation_confirmed") expect(input.results).toEqual([{ char: "山", result: "wrong" }]); if (input.type === "dictation_photo") expect(input.imageUrl).toMatch(/^data:image\/jpeg;base64,/); packet = await service.event(input); }
    await route.fulfill({ json: packet });
  });
  await page.goto("/learn");
  await page.getByRole("button", { name: "我来说", exact: true }).click();
  await page.getByLabel("今天要做什么？").fill("认生字和读课文");
  await page.getByRole("button", { name: "好了，给你看看" }).click();
  await page.getByLabel("第1项作业").fill("认一认生字");
  await page.getByRole("button", { name: "对的，开始" }).click();
  await page.getByRole("button", { name: "认识", exact: true }).click();
  await page.getByLabel("我想说").fill("高山");
  await page.getByRole("button", { name: "好了，听听我的" }).click();
  await page.getByRole("button", { name: "播放这个词" }).click();
  await expect(page.getByRole("button", { name: "再听一遍" })).toBeVisible();
  await page.getByRole("button", { name: "下一个", exact: true }).click();
  await page.getByLabel("拍下我写的字", { exact: true }).setInputFiles({ name: "fictional.png", mimeType: "image/png", buffer: Buffer.from(demoPhoto.split(",")[1]!, "base64") });
  await page.getByRole("button", { name: "不一样", exact: true }).click();
  await expect(page.getByText("这个字我们再看看。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "我看好了" }).click();
  await page.getByRole("button", { name: "下次再读" }).click();
  await expect(page.getByRole("heading", { name: "今天的小收获" })).toBeVisible();
  await page.getByRole("button", { name: "开心", exact: true }).click();
  await expect(page.getByText("今天辛苦啦，去休息吧。")).toBeVisible();
  expect(calls).toEqual(["start", "homework", "homework_confirmed", "recognize_result", "coach", "dictation_played", "dictation_photo", "dictation_confirmed", "reading_choice", "wrap_up_done"]);
});
test("3 服务异常只显示中文重试，可恢复", async ({ page }) => {
  let tries = 0;
  await page.route("**/api/session", route => ++tries === 1 ? route.fulfill({ status: 503, body: "Error 503 undefined" }) : route.fulfill({ json: demoPacket("homework_capture") }));
  await page.goto("/learn");
  await expect(page.getByText("小问号在想，等一下", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/Error|undefined|503|失败|错误|提交|确认/);
  await page.getByRole("button", { name: "再试一次" }).click();
  await expect(page.getByRole("button", { name: "我来说", exact: true })).toBeVisible();
});
test("6 每个屏幕出口都发 quit，包括等待与重试", async ({ page }) => {
  for (const screen of SessionStateSchema.options) {
    const events: unknown[] = [];
    await page.route("**/api/session**", async route => {
      const input = route.request().postDataJSON();
      if (input.type) events.push(input);
      await route.fulfill({ json: demoPacket(input.type ? "ended" : screen) });
    });
    await page.goto(`/learn?lessonId=exit-fixture-${screen}`);
    await page.getByRole("button", { name: "今天先到这", exact: true }).click();
    await expect.poll(() => events).toEqual([{ type: "quit" }]);
    await page.unroute("**/api/session**");
  }
});
for (const size of [{ width: 375, height: 667 }, { width: 1024, height: 768 }]) {
  test(`4/7 全屏幕截图和触控区域 ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    const dir = resolve(`src/ui/evidence/${size.width}x${size.height}`); await mkdir(dir, { recursive: true });
    for (const screen of SessionStateSchema.options) {
      await page.goto(`/learn/preview?screen=${screen}`);
      await expect(page.getByRole("button", { name: "今天先到这" })).toBeVisible();
      await page.locator(".child-app h1").waitFor();
      await page.evaluate(() => document.fonts.ready);
      if (screen === "dictation_compare") await page.waitForFunction(() => document.querySelector(".comparison img")?.getAttribute("src")?.startsWith("data:image/jpeg"));
      const sizes = await page.locator(".child-app button").evaluateAll(buttons => buttons.map(button => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
      expect(sizes.every(button => button.width >= 56 && button.height >= 56)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: resolve(dir, `${screen}.png`), fullPage: true });
    }
  });
}
test("4 320窄屏全部屏幕无横滚，键盘可操作", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const screen of SessionStateSchema.options) {
    await page.goto(`/learn/preview?screen=${screen}`);
    await expect(page.getByRole("button", { name: "今天先到这" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (screen === "homework_capture") { await page.getByRole("button", { name: "我来说", exact: true }).focus(); await page.keyboard.press("Enter"); await expect(page.getByLabel("今天要做什么？")).toBeVisible(); }
  }
});
test("图片长边压缩、裁切与空坐标整图回退", async ({ page }) => {
  await page.goto("/learn/preview");
  const png = await page.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 2400; canvas.height = 1800; const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0,0,2400,1800); ctx.fillStyle = "#333"; ctx.fillRect(240,180,960,720); return canvas.toDataURL("image/png"); });
  let sent = "";
  await page.route("**/api/session**", async route => {
    const input = route.request().postDataJSON();
    if (input.type === "dictation_photo") sent = input.imageUrl;
    await route.fulfill({ json: demoPacket(input.type ? "reading_offer" : "dictation_capture") });
  });
  await page.goto("/learn");
  await page.getByLabel("拍下我写的字", { exact: true }).setInputFiles({ name: "fictional-large.png", mimeType: "image/png", buffer: Buffer.from(png.split(",")[1]!, "base64") });
  await expect(page.getByRole("heading", { name: "再遇见一个小故事" })).toBeVisible();
  const dimensions = await page.evaluate(src => new Promise<number[]>(resolve => { const img = new Image(); img.onload = () => resolve([img.naturalWidth, img.naturalHeight]); img.src = src; }), sent);
  expect(dimensions).toEqual([1600, 1200]); expect(Buffer.from(sent.split(",")[1]!, "base64").length).toBeLessThanOrEqual(2 * 1024 * 1024);
  await page.unroute("**/api/session**");
  await page.route("**/api/session", route => {
    const packet = demoPacket("dictation_compare");
    const show = packet.effects[0] as { data: { marks: { box: null }[] } }; show.data.marks[0]!.box = null;
    return route.fulfill({ json: packet });
  });
  await page.goto("/learn?lessonId=image-fallback-fixture"); await expect(page.getByText("在照片里找：")).toBeVisible(); expect(await page.locator(".comparison img").getAttribute("src")).toBe(demoPhoto);
});

test("照片不可用时不能判断，可重试恢复", async ({ page }) => {
  let delivered = 0;
  await page.route("**/api/session**", async route => {
    const packet = demoPacket("dictation_compare");
    const data = (packet.effects[0] as { data: { imageUrl: string; marks: { box: number[] | null }[] } }).data;
    data.imageUrl = "data:image/png;base64,YmFk";
    data.marks[0]!.box = null;
    if (route.request().postDataJSON().type) delivered++;
    await route.fulfill({ json: packet });
  });
  await page.goto("/learn");
  await expect(page.getByText("这张照片还没看清，可以再试一次，或者今天先到这。")).toBeVisible();
  await expect(page.getByRole("button", { name: "一样", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "我看好了" })).toBeDisabled();
  await page.getByRole("button", { name: "再试一次" }).click();
  await expect(page.getByText("这张照片还没看清，可以再试一次，或者今天先到这。")).toBeVisible();
  await expect(page.getByRole("button", { name: "一样", exact: true })).toBeDisabled();
  expect(delivered).toBe(0);
});
test("裁图失败后重试成功才能判断", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    (window as unknown as { failCrop: boolean }).failCrop = true;
    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      if ((window as unknown as { failCrop: boolean }).failCrop) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.route("**/api/session", route => route.fulfill({ json: demoPacket("dictation_compare") }));
  await page.goto("/learn");
  await expect(page.getByRole("button", { name: "再试一次" })).toBeVisible();
  await expect(page.getByRole("button", { name: "一样", exact: true })).toBeDisabled();
  await page.evaluate(() => { (window as unknown as { failCrop: boolean }).failCrop = false; });
  await page.getByRole("button", { name: "再试一次" }).click();
  await expect(page.getByRole("button", { name: "一样", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "一样", exact: true }).click();
  await expect(page.getByRole("button", { name: "我看好了" })).toBeEnabled();
});
