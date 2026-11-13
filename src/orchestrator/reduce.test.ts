import { describe, expect, it } from "vitest";
import type { DailyPlan, SessionContext, SessionEvent, SessionState, Transition } from "../contracts/orchestrator";
import type { ChildChar } from "../contracts/schemas";
import { initContext, reduce } from "./reduce";
import { advanceChar, planDay } from "./schedule";

const states: SessionState[] = [
  "idle", "homework_capture", "homework_confirm", "recognize", "understand", "dictation_play",
  "dictation_capture", "dictation_compare", "reading_offer", "reading", "retell", "essay_interview",
  "essay_cards", "essay_feedback", "wrap_up", "ended",
];

function context(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    ...initContext({
      sessionId: "fictional-session", childId: "fictional-child", today: "2026-11-29",
      plan: { newChars: ["休"], reviewChars: [], carryOverChars: [] },
      stageOf: { 休: "recognize" }, kindOf: { 休: "write" }, limitMinutes: 40,
    }),
    ...overrides,
  };
}

function cc(char: string, overrides: Partial<ChildChar> = {}): ChildChar {
  return {
    childId: "fictional-child", char, kind: "write", stage: "recognize", correctStreak: 0,
    nextReviewOn: null, wrongCount: 0, lastSeenOn: null, ...overrides,
  };
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}

/** 假外层只执行效果：保存完整记录，原样传回ctx，不补写或裁剪任何字段。 */
function harness(
  records: ChildChar[] = [cc("休")],
  plan: DailyPlan = { newChars: ["休"], reviewChars: [], carryOverChars: [] },
  jsonRoundTrip = false,
) {
  let state: SessionState = "idle";
  const initial = context({
    plan, stageOf: Object.fromEntries(records.map((item) => [item.char, item.stage])),
    kindOf: Object.fromEntries(records.map((item) => [item.char, item.kind])),
  });
  let ctx: SessionContext = jsonRoundTrip ? JSON.parse(JSON.stringify(initial)) as SessionContext : initial;
  const store = new Map(records.map((item) => [item.char, item]));
  const visited: SessionState[] = [];
  const transitions: Transition[] = [];
  return {
    get state() { return state; },
    get ctx() { return ctx; },
    store, visited, transitions,
    step(event: SessionEvent) {
      const snapshot = structuredClone(ctx);
      const transition = reduce(state, freeze(ctx), freeze(event));
      expect(ctx).toEqual(snapshot);
      for (const effect of transition.effects) {
        if (effect.type === "persist_char") {
          const stored = store.get(effect.char);
          if (!stored) throw new Error("测试中未初始化该字");
          const advanced = advanceChar(stored, effect.result, transition.ctx.today);
          store.set(effect.char, advanced);
          expect(advanced.stage, `[22] ${effect.char}的数据库阶段与会话阶段一致`).toBe(transition.ctx.stageOf[effect.char]);
        }
      }
      for (const [char, stored] of store) expect(stored.stage).toBe(transition.ctx.stageOf[char]);
      // 整个上下文直接保存/传回；JSON往返也只还原原对象的值。
      ctx = jsonRoundTrip ? JSON.parse(JSON.stringify(transition.ctx)) as SessionContext : transition.ctx;
      state = transition.state;
      visited.push(state);
      transitions.push(transition);
      return transition;
    },
  };
}

function begin(run: ReturnType<typeof harness>, essay = false) {
  run.step({ type: "start", hasEssayToday: essay });
  run.step({ type: "homework_captured" });
  run.step({ type: "homework_confirmed", items: [] });
}

function literacy(run: ReturnType<typeof harness>) {
  run.step({ type: "recognize_result", char: "休", result: "correct", mode: "self_report" });
  run.step({ type: "understand_done", char: "休", result: "correct" });
  run.step({ type: "dictation_played" });
  run.step({ type: "dictation_photo", imageUrl: "https://example.invalid/fictional.png" });
  run.step({ type: "dictation_confirmed", results: [{ char: "休", result: "correct" }] });
}

describe("完整会话", () => {
  it("[7] 无作文正常路径按顺序完成认字、听写、阅读、复述和收尾", () => {
    const run = harness();
    begin(run);
    literacy(run);
    run.step({ type: "reading_choice", accept: true });
    run.step({ type: "reading_done" });
    const closing = run.step({ type: "retell_done" });
    expect(closing.effects).toContainEqual({ type: "persist_session" });
    const ended = run.step({ type: "wrap_up_done" });
    expect(ended.effects).toEqual([{ type: "end_session" }]);
    expect(run.visited).toEqual([
      "homework_capture", "homework_confirm", "recognize", "understand", "dictation_play", "dictation_capture",
      "dictation_compare", "reading_offer", "reading", "retell", "wrap_up", "ended",
    ]);
    expect(run.store.get("休")).toMatchObject({ stage: "review_2d", correctStreak: 3, nextReviewOn: "2026-12-01" });
    expect(run.transitions.flatMap(({ effects }) => effects)).toContainEqual({ type: "play_audio", chars: ["休"] });
  });

  it("[8] start为true即使清单没有作文也在认字后经过作文三阶段，不经过阅读推荐", () => {
    const run = harness();
    begin(run, true);
    literacy(run);
    expect(run.state).toBe("essay_interview");
    run.step({ type: "essay_step_done" });
    run.step({ type: "essay_step_done" });
    run.step({ type: "essay_step_done" });
    run.step({ type: "wrap_up_done" });
    expect(run.visited).toEqual([
      "homework_capture", "homework_confirm", "recognize", "understand", "dictation_play", "dictation_capture",
      "dictation_compare", "essay_interview", "essay_cards", "essay_feedback", "wrap_up", "ended",
    ]);
  });

  it("[8] 两个会话交错执行且每步JSON往返，作文标志互不串扰", () => {
    const essay = harness([], { newChars: [], reviewChars: [], carryOverChars: [] }, true);
    const reading = harness([], { newChars: [], reviewChars: [], carryOverChars: [] }, true);
    essay.step({ type: "start", hasEssayToday: true });
    reading.step({ type: "start", hasEssayToday: false });
    for (const run of [reading, essay]) {
      run.step({ type: "homework_captured" });
      run.step({ type: "homework_confirmed", items: [] });
    }
    expect(essay.state).toBe("essay_interview");
    expect(reading.state).toBe("reading_offer");
  });

  it("[9] 全部为会认字时跳过整个听写流程", () => {
    const run = harness([cc("休", { kind: "recognize_only" })]);
    begin(run);
    run.step({ type: "recognize_result", char: "休", result: "correct", mode: "self_report" });
    run.step({ type: "understand_done", char: "休", result: "correct" });
    expect(run.state).toBe("reading_offer");
    expect(run.visited).toEqual(["homework_capture", "homework_confirm", "recognize", "understand", "reading_offer"]);
    expect(run.transitions.flatMap(({ effects }) => effects).some(({ type }) => type === "play_audio")).toBe(false);
    expect(run.store.get("休")).toMatchObject({ stage: "review_2d", nextReviewOn: "2026-12-01" });
  });

  it("[10] 拒绝阅读直接收尾并持久化会话", () => {
    const ctx = context();
    const next = reduce("reading_offer", ctx, { type: "reading_choice", accept: false });
    expect(next.state).toBe("wrap_up");
    expect(next.effects).toEqual([{ type: "persist_session" }, { type: "show", screen: "wrap_up" }]);
  });
});

describe("终止和非法事件", () => {
  for (const state of states.filter((state) => state !== "ended" && state !== "wrap_up")) {
    for (const type of ["time_up", "quit"] as const) {
      it(`[11] ${state}收到${type}先持久化收尾，再收到完成确认才结束`, () => {
        const ctx = freeze(context({ queue: ["休"] }));
        const closing = reduce(state, ctx, { type });
        expect(closing.state).toBe("wrap_up");
        expect(closing.effects).toEqual([{ type: "persist_session" }, { type: "show", screen: "wrap_up" }]);
        const ended = reduce(closing.state, closing.ctx, { type: "wrap_up_done" });
        expect(ended.state).toBe("ended");
        expect(ended.effects).toEqual([{ type: "end_session" }]);
        expect(ctx.queue).toEqual(["休"]);
      });
    }
  }

  const events: SessionEvent[] = [
    { type: "start", hasEssayToday: false }, { type: "homework_captured" }, { type: "homework_confirmed", items: [] },
    { type: "recognize_result", char: "休", result: "correct", mode: "self_report" },
    { type: "understand_done", char: "休", result: "correct" }, { type: "dictation_played" },
    { type: "dictation_photo", imageUrl: "https://example.invalid/photo" },
    { type: "dictation_confirmed", results: [{ char: "休", result: "correct" }] },
    { type: "reading_choice", accept: true }, { type: "reading_done" }, { type: "retell_done" },
    { type: "essay_step_done" }, { type: "wrap_up_done" }, { type: "time_up" }, { type: "quit" },
  ];
  const allowed: Record<SessionState, SessionEvent["type"][]> = {
    idle: ["start"], homework_capture: ["homework_captured"], homework_confirm: ["homework_confirmed"],
    recognize: ["recognize_result"], understand: ["understand_done"], dictation_play: ["dictation_played"],
    dictation_capture: ["dictation_photo"], dictation_compare: ["dictation_confirmed"],
    reading_offer: ["reading_choice"], reading: ["reading_done"], retell: ["retell_done"],
    essay_interview: ["essay_step_done"], essay_cards: ["essay_step_done"], essay_feedback: ["essay_step_done"],
    wrap_up: ["wrap_up_done"], ended: [],
  };
  for (const state of states) {
    for (const event of events) {
      if (allowed[state].includes(event.type)
        || (state !== "ended" && (event.type === "quit" || event.type === "time_up"))) continue;
      it(`[12] ${state}不接受${event.type}，精确返回原上下文且无效果`, () => {
        const ctx = freeze(context({ queue: ["休"], understandQueue: ["休"], writeQueue: ["休"] }));
        const next = reduce(state, ctx, freeze(event));
        expect(next.state).toBe(state);
        expect(next.ctx).toBe(ctx);
        expect(next.effects).toEqual([]);
      });
    }
  }

  it.each(["recognize", "understand"] as const)("[12] %s拒绝队列之外的字", (state) => {
    const ctx = context({ queue: ["休"], understandQueue: ["休"] });
    const event: SessionEvent = state === "recognize"
      ? { type: "recognize_result", char: "木", result: "correct", mode: "self_report" }
      : { type: "understand_done", char: "木", result: "correct" };
    expect(reduce(state, ctx, event)).toEqual({ state, ctx, effects: [] });
  });

  it("[12] 听写确认拒绝缺项、重复或队列外的结果", () => {
    const ctx = freeze(context({ queue: ["休", "木"], writeQueue: ["休", "木"] }));
    for (const chars of [[], ["休"], ["休", "休"], ["休", "林"], ["休", "木", "林"]]) {
      const next = reduce("dictation_compare", ctx, {
        type: "dictation_confirmed", results: chars.map((char) => ({ char, result: "correct" })),
      });
      expect(next).toEqual({ state: "dictation_compare", ctx, effects: [] });
      expect(next.ctx).toBe(ctx);
    }
  });
});

describe("认读队列与持久化", () => {
  it.each(["asr", "self_report"] as const)("[13] %s每个结果仅持久化一次，队列清空前不离开recognize", (mode) => {
    const run = harness([cc("休"), cc("林")], { newChars: ["休", "林"], reviewChars: [], carryOverChars: [] });
    begin(run);
    const first = run.step({ type: "recognize_result", char: "休", result: "correct", mode });
    expect(first.state).toBe("recognize");
    expect(first.ctx.queue).toEqual(["林"]);
    expect(first.effects.filter(({ type }) => type === "persist_char")).toEqual([
      { type: "persist_char", char: "休", result: "correct" },
    ]);
    expect(first.effects).toContainEqual({
      type: "show", screen: "recognize", data: { recognition: { char: "休", result: "correct", mode } },
    });
    const beforeSecond = run.ctx.stageOf;
    const second = run.step({ type: "recognize_result", char: "林", result: "wrong", mode });
    expect(second.state).toBe("understand");
    expect(second.effects.filter(({ type }) => type === "persist_char")).toEqual([
      { type: "persist_char", char: "林", result: "wrong" },
    ]);
    expect(second.effects).toContainEqual({
      type: "show", screen: "understand", data: { recognition: { char: "林", result: "wrong", mode } },
    });
    expect(second.ctx.stageOf).not.toBe(beforeSecond);
    expect(beforeSecond).toEqual({ 休: "understand", 林: "recognize" });
    expect(second.ctx.stageOf).toEqual({ 休: "understand", 林: "understand" });
    expect(run.store.get("林")).toMatchObject({ stage: "understand", wrongCount: 1 });
  });

  it("[14] 答对的复习字不进understand，所有新字和答错的复习字均进入且无重复", () => {
    const run = harness([
      cc("休"), cc("林"), cc("木", { stage: "review_2d" }), cc("明", { stage: "review_7d" }),
    ], { newChars: ["休", "林"], reviewChars: ["木", "明"], carryOverChars: [] });
    begin(run);
    for (const [char, result] of [["休", "correct"], ["林", "wrong"], ["木", "correct"], ["明", "wrong"]] as const) {
      run.step({ type: "recognize_result", char, result, mode: "self_report" });
    }
    expect(run.state).toBe("understand");
    expect(run.ctx.queue).toEqual(["休", "林", "明"]);
  });

  it("[14] 只有答对的复习字时同时跳过理解与听写", () => {
    const run = harness([cc("木", { stage: "review_2d" })], { newChars: [], reviewChars: ["木"], carryOverChars: [] });
    begin(run);
    run.step({ type: "recognize_result", char: "木", result: "correct", mode: "self_report" });
    expect(run.state).toBe("reading_offer");
    expect(run.visited).toEqual(["homework_capture", "homework_confirm", "recognize", "reading_offer"]);
    expect(run.store.get("木")).toMatchObject({ stage: "review_7d", nextReviewOn: "2026-12-06" });
  });

  it("[14][18] 认读答错的新字只完成一次理解就进入听写，不依赖外层改ctx", () => {
    const run = harness();
    begin(run);
    run.step({ type: "recognize_result", char: "休", result: "wrong", mode: "self_report" });
    expect(run.ctx.stageOf["休"]).toBe("understand");
    expect(run.store.get("休")?.stage).toBe("understand");
    run.step({ type: "understand_done", char: "休", result: "correct" });
    expect(run.state).toBe("dictation_play");
    expect(run.ctx.understandQueue).toEqual([]);
    expect(run.ctx.understandAttempts["休"]).toBe(1);
    expect(run.transitions.flatMap(({ effects }) => effects).filter((effect) => effect.type === "call_agent" && effect.agent === "char_coach")).toEqual([
      { type: "call_agent", agent: "char_coach", payload: { char: "休", step: "explain" } },
    ]);
    expect(run.store.get("休")?.stage).toBe("write");
    run.step({ type: "dictation_played" });
    run.step({ type: "dictation_photo", imageUrl: "https://example.invalid/fictional.png" });
    run.step({ type: "dictation_confirmed", results: [{ char: "休", result: "wrong" }] });
    expect(run.store.get("休")).toMatchObject({ stage: "understand", wrongCount: 2 });
    expect(run.state).toBe("reading_offer");
  });
});

it("[7] initContext复制计划和映射并初始化契约的全部会话字段", () => {
  const source = freeze({
    sessionId: "fictional-session", childId: "fictional-child", today: "2026-11-29", limitMinutes: 40,
    plan: { newChars: ["休"], reviewChars: [], carryOverChars: [] }, stageOf: { 休: "recognize" as const }, kindOf: { 休: "write" as const },
  });
  const result = initContext(source);
  expect(result).toEqual({ ...source, hasEssayToday: false, queue: [], understandQueue: [], writeQueue: [], understandAttempts: {}, homework: [], elapsedMinutes: 0 });
  for (const key of ["plan", "stageOf", "kindOf"] as const) expect(result[key]).not.toBe(source[key]);
  expect(result.plan.newChars).not.toBe(source.plan.newChars);
  expect(result.plan.reviewChars).not.toBe(source.plan.reviewChars);
  expect(result.plan.carryOverChars).not.toBe(source.plan.carryOverChars);
});

it("[7] 效果仅包含已知数据，听写照片地址和当前字传给外层，不拼提示词", () => {
  const ctx = context({ queue: ["休"], writeQueue: ["休"] });
  const next = reduce("dictation_capture", freeze(ctx), { type: "dictation_photo", imageUrl: "https://example.invalid/fictional.png" });
  expect(next.effects).toEqual([
    { type: "call_agent", agent: "vision_dictation", payload: { imageUrl: "https://example.invalid/fictional.png", chars: ["休"] } },
    { type: "show", screen: "dictation_compare" },
  ]);
  expect(next.ctx.stageOf).toEqual(ctx.stageOf);
});

it.each(["write", "recognize_only"] as const)("[19] %s字理解连续错两次就放过，阶段保留并进入次日遗留计划", (kind) => {
  const run = harness([cc("休", { kind }), cc("林")], { newChars: ["休", "林"], reviewChars: [], carryOverChars: [] }, true);
  begin(run);
  for (const char of ["休", "林"]) run.step({ type: "recognize_result", char, result: "correct", mode: "self_report" });
  run.step({ type: "understand_done", char: "休", result: "wrong" });
  expect(run.ctx.understandQueue).toEqual(["休", "林"]);
  expect(run.ctx.understandAttempts["休"]).toBe(1);
  run.step({ type: "understand_done", char: "休", result: "wrong" });
  expect(run.state).toBe("understand");
  expect(run.ctx.understandQueue).toEqual(["林"]);
  expect(run.ctx.queue).toEqual(["林"]);
  expect(run.ctx.understandAttempts["休"]).toBe(2);
  expect(run.ctx.stageOf["休"]).toBe("understand");
  expect(run.ctx.writeQueue).toEqual([]);
  const stale = run.step({ type: "understand_done", char: "休", result: "correct" });
  expect(stale.effects).toEqual([]);
  run.step({ type: "understand_done", char: "林", result: "correct" });
  expect(run.state).toBe("dictation_play");
  expect(run.ctx.writeQueue).toEqual(["林"]);
  expect(run.store.get("休")).toMatchObject({ stage: "understand", wrongCount: 2 });
  expect(planDay([...run.store.values()], [], "2026-11-30").carryOverChars).toContain("休");
});

it("[19] 唯一的字理解错两次后跳过听写并继续会话", () => {
  const run = harness();
  begin(run);
  run.step({ type: "recognize_result", char: "休", result: "wrong", mode: "self_report" });
  run.step({ type: "understand_done", char: "休", result: "wrong" });
  run.step({ type: "understand_done", char: "休", result: "wrong" });
  expect(run.state).toBe("reading_offer");
  expect(run.ctx.understandQueue).toEqual([]);
  expect(run.ctx.writeQueue).toEqual([]);
  expect(run.ctx.stageOf["休"]).toBe("understand");
  expect(run.ctx.understandAttempts["休"]).toBe(2);
  expect(run.transitions.flatMap(({ effects }) => effects).filter((effect) => effect.type === "call_agent" && effect.agent === "char_coach")).toHaveLength(2);
});

it("[19] 第二次理解答对仍正常晋级并进入听写，不误判为两次失败", () => {
  const run = harness();
  begin(run);
  run.step({ type: "recognize_result", char: "休", result: "wrong", mode: "self_report" });
  run.step({ type: "understand_done", char: "休", result: "wrong" });
  run.step({ type: "understand_done", char: "休", result: "correct" });
  expect(run.state).toBe("dictation_play");
  expect(run.ctx.understandAttempts["休"]).toBe(2);
  expect(run.ctx.understandQueue).toEqual([]);
  expect(run.ctx.writeQueue).toEqual(["休"]);
  expect(run.ctx.stageOf["休"]).toBe("write");
});

it.each(["write", "recognize_only"] as const)("[20] 只有遗留字时跳过认读，理解后将%s类别按需加入已有听写队列", (kind) => {
  const run = harness([cc("休", { stage: "understand", kind }), cc("林", { stage: "write" })], {
    newChars: [], reviewChars: [], carryOverChars: ["休", "林"],
  }, true);
  begin(run);
  expect(run.visited).toEqual(["homework_capture", "homework_confirm", "understand"]);
  expect(run.ctx.understandQueue).toEqual(["休"]);
  expect(run.ctx.writeQueue).toEqual(["林"]);
  expect(run.transitions.flatMap(({ effects }) => effects).some((effect) => effect.type === "persist_char")).toBe(false);
  run.step({ type: "understand_done", char: "休", result: "correct" });
  const expected = kind === "write" ? ["林", "休"] : ["林"];
  expect(run.state).toBe("dictation_play");
  expect(run.ctx.queue).toEqual(expected);
  expect(run.ctx.writeQueue).toEqual(expected);
  expect(run.transitions.at(-1)?.effects).toContainEqual({ type: "play_audio", chars: expected });
  expect(run.visited).not.toContain("recognize");
});

it("[20] 只有书写遗留字时同时跳过认读和理解", () => {
  const run = harness([cc("林", { stage: "write" })], { newChars: [], reviewChars: [], carryOverChars: ["林"] });
  begin(run);
  expect(run.visited).toEqual(["homework_capture", "homework_confirm", "dictation_play"]);
  expect(run.ctx.queue).toEqual(["林"]);
});

function normalTrace(essay: boolean, jsonRoundTrip: boolean) {
  const run = harness([cc("休")], { newChars: ["休"], reviewChars: [], carryOverChars: [] }, jsonRoundTrip);
  begin(run, essay);
  literacy(run);
  if (essay) {
    for (let step = 0; step < 3; step += 1) run.step({ type: "essay_step_done" });
  } else {
    run.step({ type: "reading_choice", accept: true });
    run.step({ type: "reading_done" });
    run.step({ type: "retell_done" });
  }
  run.step({ type: "wrap_up_done" });
  return run;
}

it.each([false, true])("[21] 正常路径hasEssayToday=%s全程JSON往返与直接传回的每一步状态、效果和最终记录完全一致", (essay) => {
  const direct = normalTrace(essay, false);
  const restored = normalTrace(essay, true);
  expect(direct.state).toBe("ended");
  expect(restored.state).toBe("ended");
  expect(restored.transitions).toEqual(direct.transitions);
  expect(restored.ctx).toEqual(direct.ctx);
  expect([...restored.store]).toEqual([...direct.store]);
});

it("[22] 外层只执行persist_char，包含新字、复习、遗留、重试和听写错题的每一步阶段都与ctx一致", () => {
  const run = harness([
    cc("休"), cc("木", { stage: "review_2d" }), cc("明", { stage: "review_7d" }),
    cc("林", { stage: "understand", kind: "recognize_only" }), cc("禾", { stage: "write" }),
  ], { newChars: ["休"], reviewChars: ["木", "明"], carryOverChars: ["林", "禾"] }, true);
  begin(run);
  for (const [char, result] of [["休", "wrong"], ["木", "correct"], ["明", "wrong"]] as const) {
    run.step({ type: "recognize_result", char, result, mode: "self_report" });
  }
  expect(run.ctx.understandQueue).toEqual(["林", "休", "明"]);
  for (let attempt = 0; attempt < 2; attempt += 1) run.step({ type: "understand_done", char: "林", result: "wrong" });
  for (const char of ["休", "明"]) run.step({ type: "understand_done", char, result: "correct" });
  expect(run.ctx.writeQueue).toEqual(["禾", "休", "明"]);
  run.step({ type: "dictation_played" });
  run.step({ type: "dictation_photo", imageUrl: "https://example.invalid/fictional.png" });
  const compared = run.step({ type: "dictation_confirmed", results: [
    { char: "明", result: "correct" }, { char: "休", result: "wrong" }, { char: "禾", result: "wrong" },
  ] });
  expect(compared.effects.filter(({ type }) => type === "persist_char")).toHaveLength(3);
  expect(run.ctx.stageOf).toEqual({ 休: "understand", 木: "review_7d", 明: "review_2d", 林: "understand", 禾: "understand" });
  expect(run.state).toBe("reading_offer");
  expect(run.ctx.writeQueue).toEqual([]);
  run.step({ type: "reading_choice", accept: false });
  run.step({ type: "wrap_up_done" });
  expect(run.state).toBe("ended");
  const tomorrow = planDay([...run.store.values()], [], "2026-11-30");
  expect(tomorrow.carryOverChars).toEqual(["休", "林", "禾"]);
  expect(tomorrow.reviewChars).toEqual([]);
});

it.each(["wrap_up_done", "quit", "time_up"] as const)("[11][23] wrap_up收到%s直接结束，只发end_session", (type) => {
  const ctx = freeze(context());
  const result = reduce("wrap_up", ctx, { type });
  expect(result.state).toBe("ended");
  expect(result.effects).toEqual([{ type: "end_session" }]);
  expect(result.ctx).not.toBe(ctx);
});

it("[23] wrap_up不再借用essay_step_done收尾", () => {
  const ctx = freeze(context());
  const result = reduce("wrap_up", ctx, { type: "essay_step_done" });
  expect(result).toEqual({ state: "wrap_up", ctx, effects: [] });
  expect(result.ctx).toBe(ctx);
});

it.each([false, true])("[7][8] hasEssayToday=%s的全部call_agent效果精确遵守版本2的四种payload类型", (essay) => {
  const run = normalTrace(essay, true);
  const calls = run.transitions.flatMap(({ effects }) => effects).filter(({ type }) => type === "call_agent");
  expect(calls).toEqual([
    { type: "call_agent", agent: "char_coach", payload: { char: "休", step: "explain" } },
    { type: "call_agent", agent: "vision_dictation", payload: { imageUrl: "https://example.invalid/fictional.png", chars: ["休"] } },
    ...(essay ? [
      { type: "call_agent", agent: "essay", payload: { step: "interview" } },
      { type: "call_agent", agent: "essay", payload: { step: "reader_feedback" } },
    ] : [{ type: "call_agent", agent: "reader", payload: { step: "ask" } }]),
  ]);
});

it("C7 [15] withResult 缺失stageOf/kindOf按recognize/recognize_only处理且不产生undefined", () => {
  const ctx = context({ queue: ["休"], stageOf: {}, kindOf: {} });
  const transition = reduce("recognize", ctx, { type: "recognize_result", char: "休", result: "correct", mode: "self_report" });
  expect(transition.ctx.stageOf["休"]).toBe("understand");
  expect(JSON.stringify(transition)).not.toContain("undefined");
});
