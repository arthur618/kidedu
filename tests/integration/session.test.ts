import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { getPrisma, disconnectPrisma } from "../../src/db/client";
import { upsertChild } from "../../src/db/child";
import { listChildChars, upsertChildChar } from "../../src/db/childChar";
import { getSessionRuntime } from "../../src/db/sessionRuntime";
import { getCoachRuntime } from "../../src/db/coachRuntime";
import { getCommand } from "../../src/db/sessionCommand";
import { testChild } from "../../src/db/test-fixtures";
import { createServerDeps } from "../../src/server/deps";
import config from "../../config/models.json";
import { SessionPacketSchema } from "../../src/contracts/session";
import { decodeScreen } from "../../src/ui/model";
import { database, seed, harness, chars, photo, photo2, successOutput } from "./helpers";
let db: Awaited<ReturnType<typeof database>>;
beforeAll(async () => { db = await database(); }, 60000);
beforeEach(seed);
afterAll(async () => { await db.cleanup(); });
async function compare(h: ReturnType<typeof harness>) {
  const id = await h.enterUnderstand(); await h.coachAll(id); await h.event(id, { type: "dictation_played" });
  return { id, packet: await h.event(id, { type: "dictation_photo", imageUrl: photo }) };
}
async function end(h: ReturnType<typeof harness>, id: string, wrong?: string) {
  await h.event(id, { type: "dictation_confirmed", results: chars.slice(1).map(char => ({ char, result: char === wrong ? "wrong" : "correct" })) });
  await h.event(id, { type: "reading_choice", accept: false });
  return h.event(id, { type: "wrap_up_done" });
}
describe("C7 真实数据库、编排器、Agent、护栏，只有模型假", () => {
  it("[1][2][3][5][16][18] 四字完整HTTP状态序列、排期、模型计量、真实decoder与两天后复习", async () => {
    const h = harness(); const states: string[] = [];
    const first = await h.start(); const id = first.sessionId!; states.push(first.state);
    const hw = await h.post("homework", { imageDataUrl: photo }, id); states.push(hw.state);
    states.push((await h.event(id, { type: "homework_confirmed", items: (hw.effects[0]!.data as { items: unknown[] }).items })).state);
    for (const char of chars) states.push((await h.event(id, { type: "recognize_result", char, result: "correct", mode: "self_report" })).state);
    for (const char of chars) { for (const text of ["", `${char}字`, "我想好了一句话。"]) states.push((await h.post("coach", { char, text }, id)).state); }
    states.push((await h.event(id, { type: "dictation_played" })).state);
    states.push((await h.event(id, { type: "dictation_photo", imageUrl: photo })).state);
    states.push((await h.event(id, { type: "dictation_confirmed", results: chars.slice(1).map(char => ({ char, result: "correct" })) })).state);
    states.push((await h.event(id, { type: "reading_choice", accept: false })).state);
    states.push((await h.event(id, { type: "wrap_up_done" })).state);
    expect(states).toEqual(["homework_capture", "homework_confirm", ...Array(4).fill("recognize"), ...Array(12).fill("understand"), "dictation_play", "dictation_capture", "dictation_compare", "reading_offer", "wrap_up", "ended"]);
    const records = await listChildChars(testChild.id);
    expect(records).toHaveLength(4); expect(records.every(cc => cc.stage === "review_2d" && cc.nextReviewOn === "2026-11-16")).toBe(true);
    const turns = await getPrisma().turn.findMany(); expect(turns).toHaveLength(h.fake.calls.length);
    expect(turns.some(turn => turn.inputTokens === 10 && turn.cachedInputTokens === 2)).toBe(true);
    expect(turns.filter(turn => turn.agent.startsWith("vision")).every(turn => turn.guardVerdict === "skipped")).toBe(true);
    expect(JSON.stringify(turns)).not.toContain(photo.split(",")[1]);
    h.setNow(new Date("2026-11-16T02:00:00Z")); const second = await h.start();
    const runtime = await getSessionRuntime(second.sessionId!); expect(runtime?.context.plan.newChars).toEqual([]); expect(runtime?.context.plan.reviewChars.sort()).toEqual([...chars].sort());
    expect(decodeScreen(SessionPacketSchema.parse({ state: "ended", effects: [] }))).toEqual({ screen: "ended" });
  });
  it("[4] 听写错字次日成为遗留字并跳过其认读", async () => {
    const h = harness(); const { id } = await compare(h); await end(h, id, "水");
    expect((await listChildChars(testChild.id)).find(cc => cc.char === "水")?.stage).toBe("understand");
    h.setNow(new Date("2026-11-15T02:00:00Z")); const next = await h.start(); const runtime = await getSessionRuntime(next.sessionId!);
    expect(runtime?.context.plan.carryOverChars).toEqual(["水"]); expect(runtime?.context.plan.newChars).toEqual([]);
    await h.post("homework", { spokenText: "读生字" }, next.sessionId); const packet = await h.event(next.sessionId!, { type: "homework_confirmed", items: [] });
    expect(packet.state).toBe("understand"); expect((decodeScreen(packet) as { data: { card: { char: string } } }).data.card.char).toBe("水");
  });
  it("[6] 两次无字卡引用被拦后回原文并记Incident；候选分别计量", async () => {
    const h = harness(); h.fake.setHandler(req => req.agent === "char_coach" ? { say: "先看看。", ask: null, next: "wait_child", usedCardFields: [] } : successOutput(req));
    const id = await h.enterUnderstand(); const view = decodeScreen(SessionPacketSchema.parse(await (await h.handlers().get(id)).json()));
    expect(view.screen).toBe("understand"); if (view.screen === "understand") expect(view.data.say).toBe("先看看“山”的字形。");
    expect(await getPrisma().incident.count({ where: { type: "knowledge" } })).toBe(1);
    expect((await getPrisma().turn.findMany({ where: { agent: "char_coach" } })).map(turn => turn.guardVerdict)).toEqual(["blocked", "blocked"]);
    let n = 0; h.fake.setHandler(req => req.agent === "char_coach" && ++n === 1 ? { say: "先看看。", ask: null, next: "wait_child", usedCardFields: [] } : successOutput(req));
    await h.post("coach", { char: "山", text: "" }, id);
    const last = await getPrisma().turn.findMany({ where: { agent: "char_coach" } }); expect(last.slice(-2).map(turn => turn.guardVerdict)).toEqual(["blocked", "pass"]);
  });
  it("[7][18] 缺approved字卡不调教练、不造卡、不记孩子错，可安全退出", async () => {
    await getPrisma().charCard.update({ where: { char: "山" }, data: { status: "draft" } });
    const h = harness(); const id = await h.enterUnderstand(); const before = h.fake.calls.length;
    const packet = await h.post("coach", { char: "山", text: "我不知道" }, id);
    expect(decodeScreen(packet).screen).toBe("unavailable"); expect(h.fake.calls.length).toBe(before);
    expect((await listChildChars(testChild.id)).find(cc => cc.char === "山")?.wrongCount).toBe(0);
    expect(await getPrisma().incident.count({ where: { type: "knowledge" } })).toBeGreaterThan(0);
    expect((await h.event(id, { type: "quit" })).state).toBe("wrap_up"); expect((await h.event(id, { type: "quit" })).state).toBe("ended");
  });
  it("[8][19] coach不在理解状态/字不符409，拒绝记录不会毒化后续quit", async () => {
    const h = harness(); const packet = await h.start(); const id = packet.sessionId!;
    expect((await h.request("coach", { char: "山", text: "高山" }, id)).status).toBe(409); expect(h.fake.calls).toHaveLength(0);
    expect((await h.event(id, { type: "quit" })).state).toBe("wrap_up");
    const other = harness(); const learning = await other.enterUnderstand(); const before = other.fake.calls.length;
    expect((await other.request("coach", { char: "水", text: "水字" }, learning)).status).toBe(409); expect(other.fake.calls).toHaveLength(before);
    expect((await other.event(learning, { type: "quit" })).state).toBe("wrap_up");
  });
  it("[9] 六句上限只数非空回答、重复空白不跳步、第二次活动重置", async () => {
    const h = harness(); h.fake.setHandler(req => req.agent === "char_coach" ? { say: "看看字卡。", ask: "你想说什么？", next: "wait_child", usedCardFields: ["words"] } : successOutput(req));
    const id = await h.enterUnderstand(); await h.post("coach", { char: "山", text: "" }, id); const before = h.fake.calls.length;
    for (let i = 0; i < 3; i++) await h.post("coach", { char: "山", text: "  " }, id);
    expect(h.fake.calls).toHaveLength(before); expect((await getCoachRuntime(id))?.step).toBe("make_word"); expect((await getCoachRuntime(id))?.utterances).toBe(0);
    for (let i = 0; i < 6; i++) await h.post("coach", { char: "山", text: `编造回答${i}` }, id);
    expect((await listChildChars(testChild.id)).find(cc => cc.char === "山")?.wrongCount).toBe(1);
    const coach = await getCoachRuntime(id); expect(coach?.activity).toBe(1); expect(coach?.step).toBe("explain"); expect(coach?.utterances).toBe(0);
    await h.post("coach", { char: "山", text: "" }, id); expect((await getCoachRuntime(id))?.step).toBe("make_word");
  });
  it("[10][11][13][18] unsure与全部模型失败保留capture，可正常退出；非法/超大图片400", async () => {
    const h = harness(); h.fake.setHandler(() => "fail"); const id = (await h.start()).sessionId!;
    const packet = await h.post("homework", { spokenText: "读生字" }, id); expect(packet.state).toBe("homework_capture"); expect(packet.notice).toContain("再拍");
    expect((await getSessionRuntime(id))?.state).toBe("homework_capture");
    for (const imageDataUrl of ["data:text/plain;base64,QUJD", `data:image/png;base64,${Buffer.alloc(2*1024*1024+1).toString("base64")}`]) expect((await h.request("homework", { imageDataUrl }, id)).status).toBe(400);
    expect(h.fake.calls).toHaveLength(1); expect((await h.event(id, { type: "quit" })).state).toBe("wrap_up"); expect((await h.event(id, { type: "wrap_up_done" })).state).toBe("ended");
    expect(await getPrisma().turn.count()).toBe(1);
  });
  it("[12] 时长到上限后任意操作优先wrap_up，不再执行原动作", async () => {
    const h = harness(); const id = (await h.start()).sessionId!; h.setNow(new Date("2026-11-14T02:31:00Z"));
    expect((await h.post("homework", { spokenText: "读生字" }, id)).state).toBe("wrap_up"); expect(h.fake.calls).toHaveLength(0);
  });
  it("[14] 依赖工厂拒绝openai运行时配置", () => { expect(() => createServerDeps({ config: { ...config, char_coach: { ...config.char_coach, provider: "openai" } } as NonNullable<Parameters<typeof createServerDeps>[0]>["config"] })).toThrow(); });
  it("[19] start响应丢失并发重放只建一个session；同ID异正文409；缺ID400", async () => {
    const h = harness(); const key = h.key(); const body = { childId: testChild.id, lessonId: "c7-lesson", hasEssayToday: false };
    const [a,b] = await Promise.all([h.post("start", body, undefined, key), h.post("start", body, undefined, key)]);
    expect(a).toEqual(b); expect(await getPrisma().session.count()).toBe(1);
    expect((await h.request("start", { ...body, hasEssayToday: true }, undefined, key)).status).toBe(409);
    expect((await h.handlers().post("start", new Request("http://localhost/api/session", { method: "POST", body: JSON.stringify(body) }))).status).toBe(400);
    expect((await h.handlers().post("start", new Request("http://localhost/api/session", { method: "POST", headers: { "Idempotency-Key": "bad" }, body: JSON.stringify(body) }))).status).toBe(400);
  });
  it("[19] coach同ID并发不多算一句；不同ID同会话串行；事件不重复学习统计", async () => {
    const h = harness(); const id = await h.enterUnderstand(); await h.post("coach", { char: "山", text: "" }, id); const key = h.key();
    const body = { char: "山", text: "山字" }; const packets = await Promise.all([h.post("coach", body, id, key), h.post("coach", body, id, key)]); expect(packets[0]).toEqual(packets[1]);
    expect((await getCoachRuntime(id))?.utterances).toBe(1); expect((await getCoachRuntime(id))?.step).toBe("make_sentence");
    await Promise.all([h.post("coach", { char: "山", text: "我想好一句话。" }, id), h.post("coach", { char: "水", text: "" }, id)]);
    expect((await getCoachRuntime(id))?.char).toBe("水"); expect((await getCoachRuntime(id))?.step).toBe("make_word");
    await seed(); const q = harness(); const fresh = (await q.start()).sessionId!; await q.post("homework", { spokenText: "读字" }, fresh); await q.event(fresh, { type: "homework_confirmed", items: [] });
    const eventKey = q.key(); const event = { type: "recognize_result", char: "山", result: "correct", mode: "self_report" }; await q.event(fresh, event, eventKey); await q.event(fresh, event, eventKey);
    // 同孩子第二会话已有第一会话学习记录，重试不额外增加。
    const records = await listChildChars(testChild.id); expect(records.find(cc => cc.char === "山")?.correctStreak).toBe(1);
  });
  it("[20][23] 学习转换检查点提交后故障，重建依赖重试不再reduce或累计统计", async () => {
    const h = harness(); const id = (await h.start()).sessionId!; await h.post("homework", { spokenText: "读字" }, id); await h.event(id, { type: "homework_confirmed", items: [] });
    const key = h.key(); const body = { type: "recognize_result", char: "山", result: "correct", mode: "self_report" };
    h.deps.afterCheckpoint = async () => { throw new Error("编造的崩溃"); };
    expect((await h.request("event", body, id, key)).status).toBe(500); const before = await listChildChars(testChild.id);
    expect((await getCommand(`session:${id}`, key))?.phase).toBe("transitioned"); await disconnectPrisma(); const restarted = h.restart(); const spy = vi.spyOn(restarted, "reduce");
    expect((await h.post("event", body, id, key)).state).toBe("recognize"); expect(spy).not.toHaveBeenCalled(); expect(await listChildChars(testChild.id)).toEqual(before);
  });
  it("[20] coach步骤与命令完成原子提交，完成写入失败不会推进步骤，重启后只数一句", async () => {
    const h = harness(); const id = await h.enterUnderstand(); const key = h.key(); const body = { char: "山", text: "" };
    h.deps.beforeComplete = async () => { throw new Error("编造的事务故障"); };
    expect((await h.request("coach", body, id, key)).status).toBe(500); expect((await getCoachRuntime(id))?.step).toBe("explain"); expect((await getCommand(`session:${id}`, key))?.phase).toBe("prepared");
    h.restart(); await h.post("coach", body, id, key); await h.post("coach", body, id, key); expect((await getCoachRuntime(id))?.step).toBe("make_word"); expect((await getCoachRuntime(id))?.utterances).toBe(0);
  });
  it("[18][20] understand同state换字提交后故障，GET显示当前B，重放不再推进学习", async () => {
    const h = harness(); const id = await h.enterUnderstand(); await h.post("coach", { char: "山", text: "" }, id); await h.post("coach", { char: "山", text: "山字" }, id);
    const key = h.key(); const body = { char: "山", text: "我想好一句话。" }; h.deps.afterCheckpoint = async () => { throw new Error("编造崩溃"); };
    expect((await h.request("coach", body, id, key)).status).toBe(500); h.restart(); const packet = SessionPacketSchema.parse(await (await h.handlers().get(id)).json());
    const view = decodeScreen(packet); expect(view.screen).toBe("understand"); if (view.screen === "understand") expect(view.data.card.char).toBe("水");
    const before = await listChildChars(testChild.id); await h.post("coach", body, id, key); expect(await listChildChars(testChild.id)).toEqual(before); expect((await getCoachRuntime(id))?.char).toBe("水");
  });
  it("[21][18] 图片从所有持久表与日志去除；重启GET缺图、同ID正文重放恢复原图", async () => {
    const log = vi.spyOn(console, "log"); const error = vi.spyOn(console, "error"); const h = harness(); const id = await h.enterUnderstand(); await h.coachAll(id); await h.event(id, { type: "dictation_played" });
    const key = h.key(); const body = { type: "dictation_photo", imageUrl: photo }; await h.event(id, body, key);
    const rows = await Promise.all([getPrisma().sessionCommand.findMany(), getPrisma().coachRuntime.findMany(), getPrisma().sessionRuntime.findMany(), getPrisma().session.findMany(), getPrisma().turn.findMany(), getPrisma().incident.findMany(), getPrisma().child.findMany(), getPrisma().childChar.findMany(), getPrisma().lesson.findMany(), getPrisma().charCard.findMany(), getPrisma().passage.findMany()]);
    expect(JSON.stringify([rows, log.mock.calls, error.mock.calls])).not.toContain(photo); expect(JSON.stringify(rows)).not.toContain(photo.split(",")[1]);
    h.restart(); const read = SessionPacketSchema.parse(await (await h.handlers().get(id)).json()); expect(read.unavailable?.reason).toBe("photo_not_available"); expect(decodeScreen(read).screen).toBe("unavailable");
    const replay = await h.event(id, body, key); expect((replay.effects[0]!.data as { imageUrl: string }).imageUrl).toBe(photo);
    log.mockRestore(); error.mockRestore();
  });
  it("[20][21] 图片检查点重启恢复使用同正文；新ID非法重拍不能替换原图或旧命令照片", async () => {
    const h = harness(); const { id } = await compare(h); const invalid = await h.event(id, { type: "dictation_photo", imageUrl: photo2 }); expect((invalid.effects[0]!.data as { imageUrl: string }).imageUrl).toBe(photo);
    const current = SessionPacketSchema.parse(await (await h.handlers().get(id)).json()); expect((current.effects[0]!.data as { imageUrl: string }).imageUrl).toBe(photo);
    // 另一会话在图片转换提交后崩溃，重启后不同ID的图片不冒充旧命令。
    await seed(); const other = harness(); const second = await other.enterUnderstand(); await other.coachAll(second); await other.event(second, { type: "dictation_played" });
    other.deps.afterCheckpoint = async () => { throw new Error("编造崩溃"); }; const key = other.key(); const body = { type: "dictation_photo", imageUrl: photo };
    expect((await other.request("event", body, second, key)).status).toBe(500); other.restart();
    const unrelated = await other.event(second, { type: "dictation_photo", imageUrl: photo2 });
    expect(unrelated.unavailable?.reason).toBe("photo_not_available");
    expect(other.fake.calls.filter(req => req.agent === "vision_dictation")).toHaveLength(0);
    const replay = await other.event(second, body, key); expect((replay.effects[0]!.data as { imageUrl: string }).imageUrl).toBe(photo);
  });
  it("[18] 立即退出不把未尝试到期复习字写进今天收获", async () => {
    await upsertChildChar({ childId: testChild.id, char: "山", kind: "recognize_only", stage: "review_2d", nextReviewOn: "2026-11-14", correctStreak: 2, wrongCount: 0, lastSeenOn: "2026-11-12" });
    const h = harness(); const id = (await h.start()).sessionId!; const packet = await h.event(id, { type: "quit" }); expect(packet.effects[0]?.data).toEqual({ learned: [], revisit: [] });
  });
  it("[13][18] 已进入的学习阶段模型全失败仍用可信兜底，听写保留全部可疑标记", async () => {
    const h = harness(); const id = await h.enterUnderstand(); h.fake.setHandler(() => "fail");
    for (const char of chars) { await h.post("coach", { char, text: "" }, id); for (let i = 0; i < 6; i++) await h.post("coach", { char, text: `编造回答${i}` }, id); for (let i = 0; i < 6; i++) await h.post("coach", { char, text: `第二次回答${i}` }, id); }
    expect((await getSessionRuntime(id))?.state).toBe("reading_offer"); expect((await h.event(id, { type: "quit" })).state).toBe("wrap_up"); expect((await h.event(id, { type: "quit" })).state).toBe("ended");
    await seed(); const q = harness(); const second = await q.enterUnderstand(); await q.coachAll(second); await q.event(second, { type: "dictation_played" }); q.fake.setHandler(() => "fail"); const compare = await q.event(second, { type: "dictation_photo", imageUrl: photo });
    const data = compare.effects[0]!.data as { marks: { box: unknown; suspicious: boolean; expected: string }[] }; expect(data.marks.map(mark => mark.expected)).toEqual(chars.slice(1)); expect(data.marks.every(mark => mark.box === null && mark.suspicious)).toBe(true);
  });
  it("[23] 模型开始时学习已提交，模型失败不回滚；两会话并发Turn不串账", async () => {
    const h = harness(); let checked = false; h.fake.setHandler(async req => {
      if (req.agent === "char_coach") { const rows = await listChildChars(testChild.id); expect(rows.every(cc => cc.stage === "understand")).toBe(true); checked = true; return "fail"; }
      return successOutput(req);
    });
    const id = await h.enterUnderstand(); expect(checked).toBe(true); expect((await getSessionRuntime(id))?.state).toBe("understand");
    await upsertChild({ ...testChild, id: "fictional-second-child" });
    const other = harness(); const started = await other.post("start", { childId: "fictional-second-child", lessonId: "c7-lesson", hasEssayToday: false }); await other.post("homework", { spokenText: "读字" }, started.sessionId);
    await other.event(started.sessionId!, { type: "homework_confirmed", items: [] });
    await other.recognize(started.sessionId!);
    h.fake.setHandler(async req => { await new Promise(resolve => setTimeout(resolve, 5)); return successOutput(req); });
    await Promise.all([h.post("coach", { char: "山", text: "" }, id), other.post("coach", { char: "山", text: "" }, started.sessionId!)]);
    const turns = await getPrisma().turn.findMany(); for (const turn of turns.filter(turn => turn.agent === "char_coach")) expect(JSON.parse(JSON.parse(turn.input).user).child.id).toBe(turn.sessionId === id ? testChild.id : "fictional-second-child");
    const childTurns = turns.filter(turn => turn.agent === "char_coach"); expect(childTurns.some(turn => turn.sessionId === id)).toBe(true); expect(childTurns.some(turn => turn.sessionId === started.sessionId)).toBe(true);
    expect(turns.some(turn => JSON.parse(turn.output).ok === false)).toBe(true);
  });
});
