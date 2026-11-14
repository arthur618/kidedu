import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SessionEventSchema, SessionStateSchema } from "../contracts/orchestrator";
import { LearningScreen, Frame } from "./screens";
import { createDemoService, demoPacket, demoPhoto } from "./demo";
import { decodeScreen } from "./model";
import { LearningController } from "./controller";
import { createHttpService } from "./service";
import { fitImage, cropBox } from "./images";
const noop = () => {};
const actions = { event: noop, homework: noop, coach: noop };
describe("C2 屏幕与语义", () => {
  for (const screen of SessionStateSchema.options) it(`1/6 ${screen} 有标题和出口`, () => {
    const html = renderToStaticMarkup(React.createElement(LearningScreen, { view: decodeScreen(demoPacket(screen)), actions }));
    expect(html).toContain("<h1"); expect(html).toContain("今天先到这"); expect(html).toContain("<button");
    const keywords: Record<string,string> = { homework_capture: "拍下今天的作业", homework_confirm: "对的，开始", recognize: "还不认识", understand: "我听完了", dictation_play: "播放这个词", dictation_capture: "拍下我写的字", dictation_compare: "我看好了", reading_offer: "想读一读", wrap_up: "开心", reading: "我读完了", retell: "好了，听听我的", essay_interview: "即将开放", essay_cards: "即将开放", essay_feedback: "即将开放", ended: "今天辛苦啦" };
    if (keywords[screen]) expect(html).toContain(keywords[screen]);
    expect(html).not.toMatch(/undefined|Error|失败|错误|提交|确认/);
  });
  it("4 统一触控与字号样式", () => {
    const css = readFileSync(resolve("src/ui/child.css"), "utf8");
    expect(css).toContain("min-height:56px; min-width:56px"); expect(css).toContain("font:20px"); expect(css).toContain("font-size:96px"); expect(css).toContain("max-width:720px");
  });
  it("5 孩子端源码没有禁用词", () => {
    function scan(directory: string) { for (const item of readdirSync(directory, { withFileTypes: true })) { const path = resolve(directory, item.name); if (item.isDirectory()) scan(path); else if (/\.(tsx?|css)$/.test(path) && !/\.(test|spec|browser)\./.test(path)) expect(readFileSync(path, "utf8")).not.toMatch(/提交|错误|失败|确认/); } }
    scan("src/ui"); scan("app/(child)");
  });
});
describe("C2 服务边界", () => {
  it("2 假服务全流程按契约发送事件", async () => {
    const events: string[] = []; const controller = new LearningController(createDemoService("homework_capture", type => events.push(type)));
    await controller.start(); await controller.homework({ spokenText: "认一认生字" });
    await controller.event({ type: "homework_confirmed", items: [] });
    await controller.event({ type: "recognize_result", char: "山", result: "wrong", mode: "self_report" });
    await controller.coach({ char: "山", text: "高山" }); await controller.event({ type: "dictation_played" });
    await controller.event({ type: "dictation_photo", imageUrl: demoPhoto });
    await controller.event({ type: "dictation_confirmed", results: [{ char: "山", result: "correct" }] });
    await controller.event({ type: "reading_choice", accept: false });
    expect(controller.snapshot().view?.screen).toBe("wrap_up"); await controller.event({ type: "wrap_up_done" });
    expect(controller.snapshot().view?.screen).toBe("ended");
    expect(events).toEqual(["start", "homework", "homework_confirmed", "recognize_result", "coach", "dictation_played", "dictation_photo", "dictation_confirmed", "reading_choice", "wrap_up_done"]);
  });
  it("3 隐藏任何服务异常并允许原动作重试", async () => {
    const service = createDemoService(); const start = vi.fn().mockRejectedValueOnce(new Error("Error 503 undefined")).mockResolvedValue(demoPacket("homework_capture"));
    const controller = new LearningController({ ...service, start }); await controller.start();
    expect(controller.snapshot()).toEqual({ busy: false, retry: true }); await controller.retry();
    expect(controller.snapshot().view?.screen).toBe("homework_capture"); expect(start).toHaveBeenCalledTimes(2);
  });
  it("6 任何屏幕出口均交给服务；忙时退出排队", async () => {
    for (const screen of SessionStateSchema.options) {
      const service = createDemoService(screen); const event = vi.spyOn(service, "event"); const controller = new LearningController(service);
      await controller.start(); await controller.event({ type: "quit" }); expect(event).toHaveBeenCalledWith({ type: "quit" }, expect.any(String));
    }
    let ready!: (packet: ReturnType<typeof demoPacket>) => void;
    const service = createDemoService(); service.start = () => new Promise(resolve => { ready = resolve; });
    const event = vi.spyOn(service, "event"); const controller = new LearningController(service); const pending = controller.start();
    await controller.event({ type: "quit" }); ready(demoPacket("homework_capture")); await pending; expect(event).toHaveBeenCalledWith({ type: "quit" }, expect.any(String));
  });
  it("终态不需要 show，完成和退出均可到达", async () => {
    expect(decodeScreen({ state: "ended", effects: [] })).toEqual({ screen: "ended" });
    const controller = new LearningController(createDemoService("wrap_up"));
    await controller.start(); await controller.event({ type: "quit" });
    expect(controller.snapshot().view?.screen).toBe("ended");
  });
  it("启动未建会话时退出不会覆盖启动重试，包括等待中退出", async () => {
    for (const queued of [false, true]) {
      let rejectStart!: (error: Error) => void;
      const fetcher = vi.fn().mockImplementationOnce(() => new Promise((_, reject) => { rejectStart = reject; })).mockResolvedValueOnce(new Response(JSON.stringify(demoPacket("homework_capture"))));
      const controller = new LearningController(createHttpService({ childId: "a", lessonId: "b", fetcher }));
      const pending = controller.start();
      if (queued) await controller.event({ type: "quit" });
      rejectStart(new Error("offline")); await pending;
      if (!queued) await controller.event({ type: "quit" });
      expect(controller.snapshot().retry).toBe(true); expect(fetcher).toHaveBeenCalledTimes(1);
      await controller.retry(); expect(fetcher).toHaveBeenCalledTimes(2);
      expect(controller.snapshot().view?.screen).toBe("homework_capture");
    }
  });
  it("拒绝缺失未知数据，不猜测字卡或下一屏", () => {
    expect(() => decodeScreen({ state: "understand", effects: [{ type: "show", screen: "understand", data: { char: "山" } }] })).toThrow();
    expect(() => decodeScreen({ state: "recognize", effects: [] })).toThrow();
    expect(() => decodeScreen({ state: "dictation_compare", effects: [{ type: "show", screen: "dictation_compare", data: { imageUrl: demoPhoto, chars: ["水"], marks: [] } }] })).toThrow();
  });
  it("真实适配器使用D1事件接口及C7预留接口，校验契约", async () => {
    const requests: { path: string; body: unknown }[] = [];
    const fetcher = vi.fn(async (path: string | URL | Request, init?: RequestInit) => { requests.push({ path: String(path), body: JSON.parse(String(init?.body)) }); return new Response(JSON.stringify(demoPacket("homework_capture"))); }) as unknown as typeof fetch;
    const service = createHttpService({ childId: "fictional-child", lessonId: "fictional-lesson", fetcher });
    await service.start(); await service.homework({ spokenText: "生字" }); await service.coach({ char: "山", text: "高山" }); await service.event({ type: "quit" });
    expect(requests.map(req => req.path)).toEqual(["/api/session", "/api/session/fixture-session/homework", "/api/session/fixture-session/coach", "/api/session/fixture-session/event"]);
    expect(SessionEventSchema.parse(requests[3]?.body)).toEqual({ type: "quit" });
    expect(requests[0]?.body).toEqual({ childId: "fictional-child", lessonId: "fictional-lesson", hasEssayToday: false });
  });
  it("接口非200与坏响应只进入正常重试状态", async () => {
    for (const response of [new Response("Error 500", { status: 500 }), new Response('{"state":"unknown"}')]) {
      const controller = new LearningController(createHttpService({ childId: "a", lessonId: "b", fetcher: async () => response }));
      await controller.start(); expect(controller.snapshot().retry).toBe(true); expect(JSON.stringify(controller.snapshot())).not.toMatch(/Error|500|undefined/);
    }
  });
  it("照片缩放不放大，裁图坐标限定在照片内", () => {
    expect(fitImage(3200, 2400)).toEqual({ width: 1600, height: 1200 }); expect(fitImage(600, 2000)).toEqual({ width: 480, height: 1600 }); expect(fitImage(300, 400)).toEqual({ width: 300, height: 400 });
    expect(cropBox([0.8, 0.8, 0.4, 0.4], 1000, 500)).toEqual({ x: 800, y: 400, width: 199.99999999999994, height: 99.99999999999997 });
  });
});

describe("C7 HTTP重试与预算", () => {
  it("[19] controller一次操作重试稳定ID，下一操作与排队quit用新ID", async () => {
    let index = 0; const ids: string[] = [];
    const start = vi.fn().mockRejectedValueOnce(new Error("response_lost")).mockImplementation(async (id: string) => { ids.push(id); return demoPacket("homework_capture"); });
    const coach = vi.fn().mockRejectedValueOnce(new Error("response_lost")).mockResolvedValue(demoPacket("understand"));
    const service = { ...createDemoService(), start, coach };
    const event = vi.spyOn(service, "event");
    const controller = new LearningController(service, decodeScreen, () => `operation-${String(++index).padStart(8, "0")}`);
    await controller.start(); await controller.retry(); expect(start.mock.calls[0]?.[0]).toBe(start.mock.calls[1]?.[0]);
    await controller.coach({ char: "山", text: "高山" }); await controller.retry();
    expect(coach.mock.calls[0]?.[1]).toBe(coach.mock.calls[1]?.[1]); expect(coach.mock.calls[0]?.[1]).not.toBe(start.mock.calls[0]?.[0]);
    await controller.event({ type: "quit" }); expect(event.mock.calls[0]?.[1]).not.toBe(coach.mock.calls[0]?.[1]);
  });
  it("[22] 超过8秒且预算内的真实HTTP适配器能够完成，总等待120秒", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined; let delay: number | undefined;
      const service = createHttpService({ childId: "fictional", lessonId: "lesson", setTimer: ((callback: () => void, ms: number) => { delay = ms; return setTimeout(callback, ms); }) as typeof setTimeout,
        fetcher: (async (_url, init) => { signal = init?.signal ?? undefined; await new Promise(resolve => setTimeout(resolve, 9000)); return new Response(JSON.stringify(demoPacket("homework_capture"))); }) as typeof fetch });
      const pending = service.start("operation-00000001"); await vi.advanceTimersByTimeAsync(9001); expect((await pending).state).toBe("homework_capture"); expect(delay).toBe(120000); expect(signal?.aborted).toBe(false);
    } finally { vi.useRealTimers(); }
  });
  it("[18] unavailable正常渲染及notice显示，不需要造字卡", () => {
    const view = decodeScreen({ sessionId: "fictional", state: "understand", effects: [], unavailable: { reason: "missing_content", say: "字卡还没准备好。" } });
    const html = renderToStaticMarkup(React.createElement(LearningScreen, { view, actions, notice: "今天先歇一歇。" }));
    expect(html).toContain("字卡还没准备好。"); expect(html).toContain("今天先到这"); expect(html).toContain("今天先歇一歇。");
  });
});

 describe("C10 作文公共三屏与HTTP操作",()=>{
 it("ready投影有原话选择删除、独立正文编辑框和一个反馈问题",()=>{
  const fixtures: Parameters<typeof decodeScreen>[0][]=[
   {state:"essay_interview",effects:[{type:"show",screen:"essay_interview",data:{mode:"ready",topic:"编造散步",say:"我听见了。",ask:"你听到了什么？",remaining:4}}]},
   {state:"essay_cards",effects:[{type:"show",screen:"essay_cards",data:{mode:"ready",topic:"编造散步",cards:[{id:"stable",text:"蓝 伞",sourceUtterance:0,selected:true}]}}]},
   {state:"essay_feedback",effects:[{type:"show",screen:"essay_feedback",data:{mode:"ready",say:'我看见了：“蓝伞”',ask:"我还想知道，当时你听到了什么？",quote:"蓝伞"}}]},
  ];
  const html=fixtures.map(packet=>renderToStaticMarkup(React.createElement(LearningScreen,{view:decodeScreen(packet),actions})));expect(html[0]).toContain("这些够了");expect(html[1]).toContain("你的原话");expect(html[1]).toContain("aria-pressed");expect(html[1]).toContain("删除想法：蓝 伞");expect(html[1]).toContain("我自己写的文章");expect(html[2]).toContain("先写到这里");
 });
 it("HTTP essay使用同一操作ID重试并按契约校验，不带外层上下文",async()=>{
  const packet={...demoPacket("essay_cards"),effects:[{type:"show" as const,screen:"essay_cards" as const,data:{mode:"ready",topic:"编造",cards:[]}}]};
  const fetcher=vi.fn().mockImplementation(async()=>new Response(JSON.stringify(packet)));const service=createHttpService({childId:"child",lessonId:"lesson",fetcher});await service.start("stable-start-key-0001");await service.essay!({type:"answer",text:" 编造原话 "},"stable-essay-key-0001");
  const [path,init]=fetcher.mock.calls[1]!;expect(path).toBe("/api/session/fixture-session/essay");expect(JSON.parse(init.body)).toEqual({type:"answer",text:"编造原话"});expect(init.headers["Idempotency-Key"]).toBe("stable-essay-key-0001");
 });
 });
