import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { database } from "../helpers";
import { prepare, passage, canary } from "./helpers";
import { getPrisma } from "../../../src/db/client";
import { getReadingRuntime } from "../../../src/db/readingRuntime";
import { getPassage, upsertPassage, listApprovedPassages } from "../../../src/db/passage";
import { PublicReadingPassageSchema } from "../../../src/contracts/reading";
import { selectPassage } from "../../../src/server/reading/activity";
import { LearningScreen } from "../../../src/ui/screens";
import { decodeScreen } from "../../../src/ui/model";
import { testChildChar } from "../../../src/db/test-fixtures";
let db: Awaited<ReturnType<typeof database>>;
beforeAll(async () => { db = await database(); }); afterAll(async () => { await db.cleanup(); });
it("稳定approved选择、target去重、已会认只取复习/掌握；公共schema拒绝私有字段", async () => {
 const { context } = await prepare();
 const p = { ...passage, id: "B", targetChars: ["火"] };
 const a = { ...passage, id: "A", targetChars: ["山"] };
 expect(selectPassage([p], { ...context, plan: { newChars: [], carryOverChars: [], reviewChars: [] } }, [{ ...testChildChar, char: "火", stage: "understand" }])).toBeNull();
 expect(selectPassage([p], context, [{ ...testChildChar, char: "火", stage: "mastered" }])?.id).toBe("B");
 expect(selectPassage([{ ...a, id: "draft", status: "draft" }, { ...a, id: "Z" }, a], context, [])?.id).toBe("A");
 expect(selectPassage([{ ...a, outOfScopeCount: 2 }, { ...a, id: "Z", outOfScopeCount: 0 }], context, [])?.id).toBe("Z");
 expect(selectPassage([{ ...a, id: "𐀀" }, { ...a, id: "" }], context, [])?.id).toBe("");
 expect(PublicReadingPassageSchema.safeParse(passage).success).toBe(false);
 await upsertPassage({ ...passage, id: "draft", status: "draft" }); expect((await listApprovedPassages()).map(p => p.id)).toEqual([passage.id]); expect(await getPassage("draft")).toBeNull();
});
it("选择→阅读→只读查卡→固定首问→一次追问→收尾/ended；全量ctx、原话及公共/HTML/Turn隔离", async () => {
 const spy = vi.spyOn(console, "log");
 try {
 const { h, id, context, post } = await prepare();
 const before = await getPrisma().childChar.findMany();
 const reading = await h.event(id, { type: "reading_choice", accept: true }); expect(h.fake.calls).toHaveLength(0);
 const card = await h.handlers().card(id, new Request("http://localhost?char=山")); expect((await card.json()).status).toBe("ok"); expect(card.headers.get("cache-control")).toBe("no-store");
 expect((await h.handlers().card(id, new Request("http://localhost?char=火"))).status).toBe(400);
 expect((await (await h.handlers().card(id, new Request("http://localhost?char=鸟"))).json()).status).toBe("unavailable");
 const retell = await h.event(id, { type: "reading_done" }); expect(JSON.stringify(retell)).toContain(passage.question); expect(h.fake.calls).toHaveLength(0);
 const responses = [reading, retell, await (await h.handlers().get(id)).json()];
 const first = await post("我看到了一只小鸟。"); responses.push(await first.json()); expect(first.status).toBe(200);
 const second = await post("我在第二句看到的。"); const ended = await second.json(); responses.push(ended); expect(ended.state).toBe("wrap_up"); expect(ended.notice).toBe("我听见了。");
 expect((await getReadingRuntime(id))?.transcript).toEqual(["我看到了一只小鸟。", "我在第二句看到的。"]);
 expect((await getReadingRuntime(id))?.phase).toBe("complete"); expect((await h.deps.getSessionRuntime(id))?.context).toEqual({ ...context, queue: [] });
 expect(await getPrisma().childChar.findMany()).toEqual(before);
 const turns = await getPrisma().turn.findMany(); expect(turns).toHaveLength(h.fake.calls.length); expect(turns.every(t => t.sessionId === id && t.inputTokens === 10 && t.cachedInputTokens === 2 && t.outputTokens === 5)).toBe(true);
 const html = renderToStaticMarkup(React.createElement(LearningScreen, { view: decodeScreen(reading), actions: { event() {}, homework() {}, coach() {} } }));
 for (const value of [JSON.stringify(responses), html, JSON.stringify(turns), JSON.stringify(spy.mock.calls)]) { expect(value).not.toContain(canary); expect(value).not.toContain("keyPoints"); }
 expect(JSON.stringify(await getReadingRuntime(id))).toContain(canary);
 expect((await h.event(id, { type: "quit" })).state).toBe("ended"); expect((await getReadingRuntime(id))?.phase).toBe("complete");
 } finally { spy.mockRestore(); }
});
it("同ID并发、响应丢失/重启回放不多推进，GET零模型；rejected不毒化quit", async () => {
 const { h, id, post } = await prepare(); await h.event(id, { type: "reading_choice", accept: true }); await h.event(id, { type: "reading_done" });
 const key = h.key(); const [a,b] = await Promise.all([post("第一条原话", key),post("第一条原话",key)]); expect(await a.json()).toEqual(await b.json()); expect(h.fake.calls).toHaveLength(1);
 h.restart(); expect((await post("第一条原话",key)).status).toBe(200); await h.handlers().get(id); expect(h.fake.calls).toHaveLength(1);
 expect((await post("换了内容",key)).status).toBe(409);
 await post("第二条原话"); expect((await post("第三条原话")).status).toBe(409); expect((await getReadingRuntime(id))?.transcript).toHaveLength(2); expect(h.fake.calls).toHaveLength(2);
 expect((await h.event(id, { type: "quit" })).state).toBe("ended");
});
it.each(["selection", "question", "answer", "completion"])("SQLite故障%s原子回滚与重启恢复不丢原话", async phase => {
 const { h, id, post } = await prepare(); let key = h.key();
 if (phase !== "selection") await h.event(id, { type: "reading_choice", accept: true });
 if (["answer", "completion"].includes(phase)) await h.event(id, { type: "reading_done" });
 if (phase === "completion") await post("第一条原话");
 // beforeComplete在事务内真实抛错；selection/question已transitioned checkpoint，重启只完成剩余显示。
 h.deps.beforeComplete = async () => { throw new Error("injected"); };
 const run = () => phase === "selection" ? h.request("event", { type: "reading_choice", accept: true }, id, key) : phase === "question" ? h.request("event", { type: "reading_done" }, id, key) : post(phase === "answer" ? "第一条原话" : "第二条原话", key);
 expect((await run()).status).toBe(500);
 if (["answer", "completion"].includes(phase)) { expect((await getReadingRuntime(id))?.transcript).toHaveLength(phase === "answer" ? 0 : 1); expect((await h.deps.getSessionRuntime(id))?.state).toBe("retell"); }
 h.restart(); expect((await run()).status).toBe(200);
 expect((await getReadingRuntime(id))?.phase).toBe(phase === "selection" ? "reading" : phase === "question" ? "answer" : phase === "answer" ? "follow_up" : "complete");
 if (phase === "completion") { expect((await h.deps.getSessionRuntime(id))?.state).toBe("wrap_up"); expect((await getReadingRuntime(id))?.transcript).toEqual(["第一条原话", "第二条原话"]); }
});
it("事务检查点后崩溃恢复、撤销approved不显示旧副本/调模型、缺文可退出", async () => {
 const { h, id } = await prepare(); const key = h.key(); h.deps.afterCheckpoint = async () => { throw new Error("checkpoint"); };
 expect((await h.request("event", { type: "reading_choice", accept: true }, id, key)).status).toBe(500); expect((await getReadingRuntime(id))?.phase).toBe("reading"); h.restart(); await h.event(id, { type: "reading_choice", accept: true }, key); expect(h.fake.calls).toHaveLength(0);
 await upsertPassage({ ...passage, status: "rejected" }); expect((await (await h.handlers().get(id)).json()).unavailable).toBeTruthy(); await h.event(id, { type: "reading_done" });
 expect((await h.handlers().post("reading", new Request("http://localhost", { method: "POST", headers: { "Idempotency-Key": h.key() }, body: JSON.stringify({ text: "想说" }) }), id)).status).toBe(409);
 expect((await h.event(id, { type: "quit" })).state).toBe("wrap_up"); expect((await getReadingRuntime(id))?.phase).toBe("abandoned");
 const next = await prepare(); await getPrisma().passage.deleteMany(); expect((await next.h.event(next.id, { type: "reading_choice", accept: true })).unavailable).toBeTruthy(); expect(next.h.fake.calls).toHaveLength(0); await next.h.event(next.id, { type: "quit" });
});
it.each(["leak", "fail"])("%s被拦或全失败有安全退路、失败计量正确，首问不能泄露参考片段", async mode => {
 const { h, id, post } = await prepare(); await upsertPassage({ ...passage, question: canary + "吗？" }); await h.event(id, { type: "reading_choice", accept: true });
 expect(JSON.stringify(await h.event(id, { type: "reading_done" }))).not.toContain(canary);
 h.fake.setHandler(() => mode === "fail" ? "fail" : { say: canary, ask: null, next: "step_done" });
 const first = await post("请告诉我答案。"); expect(first.status).toBe(200); expect(JSON.stringify(await first.json())).not.toContain(canary);
 const second = await post("还想再说说。"); expect(second.status).toBe(200); expect((await second.json()).state).toBe("wrap_up");
 const turns = await getPrisma().turn.findMany(); expect(turns).toHaveLength(h.fake.calls.length); expect(JSON.stringify(turns)).not.toContain(canary); expect(turns.every(t => JSON.parse(t.output).ok === (mode !== "fail"))).toBe(true);
 expect(await getPrisma().incident.count()).toBeGreaterThan(0);
});

it.each(["selection", "question"])("SQLite触发器拒绝%s命令检查点，状态/私有活动共同回滚", async phase => {
 const { h, id } = await prepare(); if (phase === "question") await h.event(id, { type: "reading_choice", accept: true });
 const previous = await getReadingRuntime(id); const before = await h.deps.getSessionRuntime(id); const key = h.key();
 await getPrisma().$executeRawUnsafe(`CREATE TRIGGER c9_checkpoint_failure BEFORE UPDATE ON SessionCommand WHEN NEW.phase = 'transitioned' BEGIN SELECT RAISE(ABORT, 'checkpoint_failure'); END`);
 try { expect((await h.request("event", phase === "selection" ? { type: "reading_choice", accept: true } : { type: "reading_done" }, id, key)).status).toBe(500); } finally { await getPrisma().$executeRawUnsafe("DROP TRIGGER c9_checkpoint_failure"); }
 expect(await getReadingRuntime(id)).toEqual(previous); expect(await h.deps.getSessionRuntime(id)).toEqual(before);
 h.restart(); expect((await h.event(id, phase === "selection" ? { type: "reading_choice", accept: true } : { type: "reading_done" }, key)).state).toBe(phase === "selection" ? "reading" : "retell");
});
it("阅读中time_up/quit保留已说原话为abandoned；已complete不重算", async () => {
 const { h, id, post } = await prepare(); await h.event(id, { type: "reading_choice", accept: true }); await h.event(id, { type: "reading_done" }); await post("我自己的第一条话。");
 expect((await h.event(id, { type: "time_up" })).state).toBe("wrap_up"); const activity = await getReadingRuntime(id); expect(activity?.phase).toBe("abandoned"); expect(activity?.completedAt).toBeNull(); expect(activity?.transcript).toEqual(["我自己的第一条话。"]);
 expect((await post("退出后的话")).status).toBe(409); expect(h.fake.calls).toHaveLength(1);
});

it("等待模型期间撤审：最终提交重查approval，不展示迟到话术、不完成活动", async () => {
 const { h, id, post } = await prepare(); await h.event(id, { type: "reading_choice", accept: true }); await h.event(id, { type: "reading_done" }); await post("第一条原话");
 let release!: (value: unknown) => void; let started!: () => void; const begun = new Promise<void>(resolve => { started = resolve; });
 h.fake.setHandler(() => { started(); return new Promise(resolve => { release = resolve; }); });
 const pending = post("第二条原话"); await begun; await upsertPassage({ ...passage, status: "rejected" }); release({ say: "我听见了。", ask: null, next: "step_done" });
 const response = await pending; expect(response.status).toBe(200); const packet = await response.json(); expect(packet.unavailable).toBeTruthy(); expect(packet.notice).toBeUndefined();
 expect((await h.deps.getSessionRuntime(id))?.state).toBe("retell"); expect((await getReadingRuntime(id))?.phase).toBe("follow_up"); expect((await getReadingRuntime(id))?.transcript).toEqual(["第一条原话"]);
 expect(JSON.stringify(await (await h.handlers().get(id)).json())).not.toContain(passage.body); await h.event(id, { type: "quit" });
});
it("纯模型故障独立记录Incident，普通首问不用替换也能正常收尾", async () => {
 const { h, id, post } = await prepare(); await h.event(id, { type: "reading_choice", accept: true }); await h.event(id, { type: "reading_done" }); expect(await getPrisma().incident.count()).toBe(0);
 h.fake.setHandler(() => "fail"); expect((await post("第一条原话")).status).toBe(200); expect(await getPrisma().incident.count()).toBeGreaterThan(0); expect((await (await post("第二条原话")).json()).state).toBe("wrap_up");
});
it("阅读预算结束后quit排队完成，迟到模型无写权限", async () => {
 const { h, id, post } = await prepare(); await h.event(id, { type: "reading_choice", accept: true }); await h.event(id, { type: "reading_done" });
 let expire!: () => void; let release!: (value: unknown) => void; let started!: () => void; const begun = new Promise<void>(resolve => { started = resolve; });
 h.deps.modelOptions.setTimer = ((callback: () => void) => { expire = callback; return 1; }) as unknown as typeof setTimeout; h.deps.modelOptions.clearTimer = () => {};
 h.fake.setHandler(() => { started(); return new Promise(resolve => { release = resolve; }); });
 const answer = post("等待中的原话"); await begun; const quit = h.event(id, { type: "quit" }); expire(); expect((await answer).status).toBe(200); expect((await quit).state).toBe("wrap_up");
 const before = await getReadingRuntime(id); expect(before?.phase).toBe("abandoned"); release({ say: canary, ask: null, next: "step_done" }); await new Promise(resolve => setImmediate(resolve));
 expect(await getReadingRuntime(id)).toEqual(before); expect((await h.deps.getSessionRuntime(id))?.state).toBe("wrap_up"); expect(h.fake.calls).toHaveLength(1);
});

it.each([{ say: "好呀。听见了。再聊聊。", ask: null }, { say: "好呀。", ask: "你想说什么？还想说什么？" }])("阅读输出分别限制say两句、ask一句：%j", async candidate => {
 const { h, id, post } = await prepare(); await h.event(id, { type: "reading_choice", accept: true }); await h.event(id, { type: "reading_done" });
 h.fake.setHandler(() => ({ ...candidate, next: "wait_child" })); const response = await post("孩子自己的话。"); expect(response.status).toBe(200); const packet = await response.json(); const output = packet.effects[0].data;
 expect((output.say.match(/[^。！？!?]+[。！？!?]*/gu) ?? []).length).toBeLessThanOrEqual(2); expect((output.ask?.match(/[^。！？!?]+[。！？!?]*/gu) ?? []).length).toBeLessThanOrEqual(1); expect(await getPrisma().incident.count()).toBeGreaterThan(0);
});
