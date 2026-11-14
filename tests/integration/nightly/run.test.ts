import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { database } from "../helpers";
import { getPrisma, disconnectPrisma } from "../../../src/db/client";
import { createNightlyRunner } from "../../../src/nightly/run";
import { getDailyReport, LEASE_MS, NightlyBusyError, NightlyLeaseLostError } from "../../../src/db/nightly/store";
import { factualFallback } from "../../../src/nightly/agents";
import { child, session, outcome, reading, essay, item, request, fakeModel, gate, moment, question, keyPoint, transcript, reason } from "./helpers";
let db: Awaited<ReturnType<typeof database>>;
beforeAll(async () => { db = await database(); }); afterAll(async () => { await db.cleanup(); });
const now = () => new Date(moment);
async function fixture() { const id = await child(); const s = await session(id, "2026-11-14T02:00:00.000Z", "2026-11-14T02:20:00.000Z", { homework: [item] }); await reading(s, "2026-11-14T02:15:00.000Z"); await essay(s, "2026-11-14T02:16:00.000Z"); return { id, s }; }
it("0分独立于失败null；原题/当时要点/换行原话准确，公开固定说明，Turn仅白名单且本日重跑不自循环", async () => {
  const { id, s } = await fixture(); const fake = fakeModel(); const run = createNightlyRunner({ llm: fake.llm, now });
  const report = await run(request(id)); expect(report.retellScores).toEqual([{ sessionId: s.id, completedAt: "2026-11-14T02:15:00.000Z", status: "scored", result: { score: 0, reason: "模型评分完成，仅供参考。" } }]);
  expect(JSON.parse(fake.calls[0]!.user)).toEqual({ question, keyPoints: [keyPoint], transcript: transcript.join("\n") });
  const reportInput = JSON.parse(fake.calls[1]!.user); expect(Object.keys(reportInput).sort()).toEqual(["child", "date", "homework", "minutes", "retellScore", "wrongChars"].sort()); expect(reportInput.retellScore).toBe(0); expect(reportInput.homework[0].done).toBe(false);
  expect(fake.calls.map(c => c.sessionId)).toEqual([s.id, s.id]); expect(report.summaryStatus).toBe("generated");
  const turns = await getPrisma().turn.findMany({ where: { sessionId: s.id }, orderBy: { agent: "asc" } });
  expect(turns).toHaveLength(2); expect(turns.every(t => t.inputTokens === 19 && t.cachedInputTokens === 7 && t.outputTokens === 6 && t.latencyMs === 11)).toBe(true);
  for (const raw of [JSON.stringify(report), JSON.stringify(turns), fake.calls[1]!.user, fake.calls[1]!.system]) for (const secret of [question, keyPoint, ...transcript, reason, "编造作文正文不能给日报模型", "私有作文点子"]) expect(raw).not.toContain(secret);
  const privateStep = await getPrisma().nightlyStep.findFirst({ where: { jobId: Number(report.id.slice(6)), key: `score:${s.id}` } }); expect(privateStep!.result).toContain(reason);
  const again = await createNightlyRunner({ llm: fake.llm, now })(request(id)); expect(again).toEqual(report); expect(fake.calls).toHaveLength(2); expect(await getDailyReport(id, "2026-11-14", "Asia/Shanghai")).toEqual(report);
});
it("最新复述失败保持null不借旧成功；显式失败重试复用成功score并使旧成功report输入失效", async () => {
  const { id, s } = await fixture(); const latest = await session(id, "2026-11-14T03:00:00.000Z", "2026-11-14T03:10:00.000Z"); await reading(latest, "2026-11-14T03:05:00.000Z");
  let fail = true; const fake = fakeModel(req => req.agent === "report" ? factualFallback(JSON.parse(req.user)) : req.sessionId === latest.id && fail ? "fail" : { score: 2, reason });
  const first = await createNightlyRunner({ llm: fake.llm, now })(request(id));
  expect(first.retellScores.map(r => r.result?.score ?? null)).toEqual([2, null]); expect(first.summary.lines).toContain("本日最新完成复述的评分不可用。"); expect(first.summaryStatus).toBe("generated"); expect(fake.calls.at(-1)!.sessionId).toBe(latest.id);
  await disconnectPrisma(); await createNightlyRunner({ llm: fake.llm, now })(request(id)); expect(fake.calls).toHaveLength(3);
  fail = false; const repaired = await createNightlyRunner({ llm: fake.llm, now })({ ...request(id), retryFailed: true });
  expect(repaired.sourceVersion).toBe(first.sourceVersion); expect(repaired.retellScores.map(r => r.result?.score)).toEqual([2, 2]); expect(repaired.summary.lines).toContain("本日最新完成复述的模型参考评分为2分（满分3分）。");
  expect(fake.calls.filter(c => c.agent === "score" && c.sessionId === s.id)).toHaveLength(1); expect(fake.calls.filter(c => c.agent === "score" && c.sessionId === latest.id)).toHaveLength(2); expect(fake.calls.filter(c => c.agent === "report")).toHaveLength(2);
  expect(await getPrisma().nightlyStep.count({ where: { jobId: Number(first.id.slice(6)), key: "report" } })).toBe(2);
  await createNightlyRunner({ llm: fake.llm, now })({ ...request(id), retryFailed: true }); expect(fake.calls).toHaveLength(5);
});
it.each(["fail", "timeout", "invalid_output"])("模型全失败%s诚实fallback、每次计量与具体错误类别、失败默认不重调", async failure => {
  const { id, s } = await fixture(); const fake = fakeModel(() => failure); const run = createNightlyRunner({ llm: fake.llm, now });
  const report = await run(request(id)); expect(report.summaryStatus).toBe("fallback"); expect(report.retellScores[0]!.result).toBeNull(); expect(report.summary.parentAction).toBe("今天不需要");
  const turns = await getPrisma().turn.findMany({ where: { sessionId: s.id } }); expect(turns).toHaveLength(2); expect(turns.every(t => JSON.parse(t.output).error === (failure === "fail" ? "provider_error" : failure))).toBe(true);
  await run(request(id)); expect(fake.calls).toHaveLength(2); await run({ ...request(id), retryFailed: true }); expect(fake.calls).toHaveLength(4);
});
it.each([
  { lines: ["今天已经完全掌握了十个字。"], parentAction: "今天不需要" },
  { lines: ["已结束会话的合并经过时长为999分钟。"], parentAction: "今天不需要" },
  { lines: ["实际错字记录涉及0个字。"], parentAction: "请家长额外听写" },
  { lines: ["实际错字记录涉及0个字。", "实际错字记录涉及0个字。"], parentAction: "今天不需要" },
])("结构合法但来源不符的日报候选拒绝并计量source_mismatch：%j", async candidate => {
  const { id, s } = await fixture(); const fake = fakeModel(req => req.agent === "score" ? { score: 1, reason } : candidate);
  const report = await createNightlyRunner({ llm: fake.llm, now })(request(id)); expect(report.summaryStatus).toBe("fallback"); expect(report.summary).toEqual(factualFallback(JSON.parse(fake.calls[1]!.user)));
  const turn = await getPrisma().turn.findFirst({ where: { sessionId: s.id, agent: "report" } }); expect(JSON.parse(turn!.output)).toMatchObject({ ok: false, error: "source_mismatch", omitted: true }); expect(turn!.inputTokens).toBe(19); expect(turn!.guardVerdict).toBe("blocked");
  expect(JSON.stringify(turn)).not.toContain(candidate.parentAction === "今天不需要" ? candidate.lines[0] : candidate.parentAction);
});
it("schema失效与抛错不暴露异常/原文；公开输出、Turn与console无私有标记", async () => {
  const { id, s } = await fixture(); const log = vi.spyOn(console, "log"), error = vi.spyOn(console, "error");
  try {
    const fake = fakeModel(req => { if (req.agent === "score") throw new Error(`${transcript[0]} ${keyPoint}`); return { lines: [], parentAction: "今天不需要" }; });
    const report = await createNightlyRunner({ llm: fake.llm, now })(request(id)); expect(report.summaryStatus).toBe("fallback");
    const turns = await getPrisma().turn.findMany({ where: { sessionId: s.id } }); expect(turns.map(t => JSON.parse(t.output).error).sort()).toEqual(["invalid_output", "provider_error"]);
    for (const marker of [...transcript, keyPoint]) expect(JSON.stringify([report, turns, log.mock.calls, error.mock.calls])).not.toContain(marker);
  } finally { log.mockRestore(); error.mockRestore(); }
});
it("新且完整零练习保持complete；零会话零调用、不伪造Session；不同孩子来源隔离", async () => {
  const id = await child(); const other = await child(); const fake = fakeModel(); const run = createNightlyRunner({ llm: fake.llm, now });
  const empty = await run(request(id)); expect(empty.facts).toMatchObject({ minutes: 0, sessionIds: [], learningCoverage: "none" }); expect(empty.summaryStatus).toBe("not_needed"); expect(fake.calls).toHaveLength(0);
  const fresh = await session(other, "2026-11-14T05:00:00.000Z", "2026-11-14T05:01:00.000Z"); const report = await run(request(other)); expect(report.facts).toMatchObject({ learningCoverage: "complete", outcomeCount: 0, practicedChars: [] }); expect(report.facts.sessionIds).toEqual([fresh.id]); expect(fake.calls).toHaveLength(1);
  expect(await run(request(id))).toEqual(empty); expect(fake.calls).toHaveLength(1);
});
it("新来源独立版本；重启成功步骤复用；模型后存库前崩溃至少一次调用可能再次计费", async () => {
  const { id, s } = await fixture(); const fake = fakeModel();
  await expect(createNightlyRunner({ llm: fake.llm, now, afterStep: async key => { if (key.startsWith("score:")) throw new Error("模拟提交后进程退出"); } })(request(id))).rejects.toThrow("模拟提交后");
  await disconnectPrisma(); const first = await createNightlyRunner({ llm: fake.llm, now })(request(id)); expect(fake.calls.map(c => c.agent)).toEqual(["score", "report"]);
  await outcome(s, "山", "wrong", "2026-11-14T02:01:00.000Z");
  await expect(createNightlyRunner({ llm: fake.llm, now, afterCall: async () => { throw new Error("模拟模型后落盘前退出"); } })(request(id))).rejects.toThrow("模型后落盘前");
  const before = fake.calls.length; await disconnectPrisma(); const second = await createNightlyRunner({ llm: fake.llm, now })(request(id)); expect(fake.calls.length).toBe(before + 1); expect(second.sourceVersion).not.toBe(first.sourceVersion); expect(second.facts.wrongChars).toEqual(["山"]);
  expect((await getPrisma().nightlyJob.findMany({ where: { childId: id } })).every(j => j.final)).toBe(true);
});
it("同任务CAS拒绝并发；模型等待不占DB事务；租约过期可恢复，迟到结果只计量不能覆盖", async () => {
  const { id, s } = await fixture(); const entered = gate(), release = gate(); let current = new Date(moment);
  const slow = fakeModel(async req => { if (req.agent === "score") { entered.open(); await release.wait; return { score: 0, reason }; } return factualFallback(JSON.parse(req.user)); });
  const pending = createNightlyRunner({ llm: slow.llm, now: () => current })(request(id)); const observed = pending.catch(e => e); await entered.wait;
  await expect(createNightlyRunner({ llm: fakeModel().llm, now: () => current })(request(id))).rejects.toBeInstanceOf(NightlyBusyError);
  const other = await child(); const otherSession = await session(other, "2026-11-14T08:00:00.000Z", "2026-11-14T08:01:00.000Z");
  const otherReport = await createNightlyRunner({ llm: fakeModel().llm, now: () => current })(request(other)); expect(otherReport.facts.sessionIds).toEqual([otherSession.id]);
  current = new Date(current.getTime() + LEASE_MS + 1); const fast = fakeModel(req => req.agent === "score" ? { score: 3, reason } : factualFallback(JSON.parse(req.user)));
  const resumed = await createNightlyRunner({ llm: fast.llm, now: () => current })(request(id)); expect(resumed.retellScores[0]!.result!.score).toBe(3);
  release.open(); expect(await observed).toBeInstanceOf(NightlyLeaseLostError); expect((await getDailyReport(id, "2026-11-14", "Asia/Shanghai"))!.retellScores[0]!.result!.score).toBe(3);
  const turns = await getPrisma().turn.findMany({ where: { sessionId: s.id } }); expect(turns).toHaveLength(3); expect(turns.some(t => JSON.parse(t.output).error === "lease_lost")).toBe(true);
});
it("源版本竞争：旧任务晚于新任务发布，历史结果留存但不覆盖公共新版本", async () => {
  const { id, s } = await fixture(); const entered = gate(), release = gate(); const fake = fakeModel();
  const old = createNightlyRunner({ llm: fake.llm, now, beforePublish: async () => { entered.open(); await release.wait; } })(request(id)); await entered.wait;
  await outcome(s, "水", "wrong", "2026-11-14T02:05:00.000Z"); const newer = await createNightlyRunner({ llm: fake.llm, now })(request(id));
  release.open(); const older = await old; expect(older.sourceVersion).not.toBe(newer.sourceVersion); expect(await getDailyReport(id, "2026-11-14", "Asia/Shanghai")).toEqual(newer);
  expect((await getPrisma().nightlyJob.findMany({ where: { childId: id } })).every(j => j.final)).toBe(true);
});
it("来源版本改变但派生score/report输入未变时跨版本复用成功步且记录来源job，不重复计费", async () => {
  const { id, s } = await fixture(); const fake = fakeModel(); const run = createNightlyRunner({ llm: fake.llm, now });
  const first = await run(request(id)); expect(fake.calls).toHaveLength(2);
  await outcome(s, "山", "correct", "2026-11-14T02:01:00.000Z"); const second = await run(request(id));
  expect(second.sourceVersion).not.toBe(first.sourceVersion); expect(second.facts.practicedChars).toEqual(["山"]); expect(fake.calls).toHaveLength(2);
  const copied = await getPrisma().nightlyStep.findMany({ where: { jobId: Number(second.id.slice(6)) } }); expect(copied).toHaveLength(2); expect(copied.every(s => s.reusedFromJobId === Number(first.id.slice(6)))).toBe(true);
  await outcome(s, "水", "wrong", "2026-11-14T02:02:00.000Z"); const third = await run(request(id)); expect(third.facts.wrongChars).toEqual(["水"]); expect(fake.calls).toHaveLength(3); expect(fake.calls.filter(c => c.agent === "score")).toHaveLength(1);
});
it("模型可精确选择事实句子集和顺序，不能改写或夹入新表现评价", async () => {
  const { id } = await fixture(); const fake = fakeModel(req => { if (req.agent === "score") return { score: 1, reason }; const data = factualFallback(JSON.parse(req.user)); return { lines: [data.lines[2], data.lines[0]], parentAction: "今天不需要" }; });
  const report = await createNightlyRunner({ llm: fake.llm, now })(request(id)); expect(report.summaryStatus).toBe("generated"); expect(report.summary.lines).toEqual(["实际错字记录涉及0个字。", "已结束会话的合并经过时长为20分钟。"]);
});
it("显式重试评分已提交但日报尚未更新时崩溃，默认重启恢复不能被旧final挡住", async () => {
  const { id } = await fixture(); let fail = true; const fake = fakeModel(req => req.agent === "report" ? factualFallback(JSON.parse(req.user)) : fail ? "fail" : { score: 3, reason });
  const first = await createNightlyRunner({ llm: fake.llm, now })(request(id)); expect(first.summary.lines).toContain("本日最新完成复述的评分不可用。");
  fail = false; await expect(createNightlyRunner({ llm: fake.llm, now, afterStep: async key => { if (key.startsWith("score:")) throw new Error("重试评分提交后退出"); } })({ ...request(id), retryFailed: true })).rejects.toThrow("重试评分提交后退出");
  await disconnectPrisma(); const resumed = await createNightlyRunner({ llm: fake.llm, now })(request(id)); expect(resumed.retellScores[0]!.result!.score).toBe(3); expect(resumed.summary.lines).toContain("本日最新完成复述的模型参考评分为3分（满分3分）。"); expect(fake.calls.map(c => c.agent)).toEqual(["score", "report", "score", "report"]);
});
it("原始来源改变不会隐式重试相同失败输入；显式retry-failed才再调用", async () => {
  const { id, s } = await fixture(); const fake = fakeModel(() => "fail"); const run = createNightlyRunner({ llm: fake.llm, now });
  const first = await run(request(id)); await outcome(s, "山", "correct", "2026-11-14T02:01:00.000Z"); const second = await run(request(id));
  expect(second.sourceVersion).not.toBe(first.sourceVersion); expect(second.summaryStatus).toBe("fallback"); expect(fake.calls).toHaveLength(2);
  await run({ ...request(id), retryFailed: true }); expect(fake.calls).toHaveLength(4);
});
