import { describe, expect, it } from "vitest";
import type { DailyPlan, SessionContext, SessionEvent, SessionState, Transition } from "../contracts/orchestrator";
import type { ChildChar } from "../contracts/schemas";
import { initialContext, reduce } from "./reduce";
import { advanceChar } from "./schedule";

const states: SessionState[] = [
  "idle", "homework_capture", "homework_confirm", "recognize", "understand", "dictation_play",
  "dictation_capture", "dictation_compare", "reading_offer", "reading", "retell", "essay_interview",
  "essay_cards", "essay_feedback", "wrap_up", "ended",
];

function context(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    sessionId: "fictional-session", childId: "fictional-child", today: "2026-11-29",
    plan: { newChars: ["休"], reviewChars: [] }, queue: [], stageOf: { 休: "recognize" }, kindOf: { 休: "write" },
    homework: [], elapsedMinutes: 0, limitMinutes: 40, ...overrides,
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

/** 假外层只依赖契约：执行persist_char后刷新stageOf，再传回后续事件。 */
function harness(records: ChildChar[] = [cc("休")], plan: DailyPlan = { newChars: ["休"], reviewChars: [] }) {
  let state: SessionState = "idle";
  let ctx: SessionContext = initialContext(context({
    plan, stageOf: Object.fromEntries(records.map((item) => [item.char, item.stage])),
    kindOf: Object.fromEntries(records.map((item) => [item.char, item.kind])),
  }));
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
      // 每一步序列化，验证内部记忆不依赖对象身份、隐藏闭包或模块变量。
      ctx = JSON.parse(JSON.stringify(transition.ctx)) as SessionContext;
      for (const effect of transition.effects) {
        if (effect.type === "persist_char") {
          const stored = store.get(effect.char);
          if (!stored) throw new Error("测试中未初始化该字");
          const advanced = advanceChar(stored, effect.result, ctx.today);
          store.set(effect.char, advanced);
          ctx = { ...ctx, stageOf: { ...ctx.stageOf, [effect.char]: advanced.stage } };
        }
      }
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
    const ended = run.step({ type: "essay_step_done" });
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
    run.step({ type: "essay_step_done" });
    expect(run.visited).toEqual([
      "homework_capture", "homework_confirm", "recognize", "understand", "dictation_play", "dictation_capture",
      "dictation_compare", "essay_interview", "essay_cards", "essay_feedback", "wrap_up", "ended",
    ]);
  });

  it("[8] 两个会话交错执行且每步JSON往返，作文标志互不串扰", () => {
    const essay = harness([], { newChars: [], reviewChars: [] });
    const reading = harness([], { newChars: [], reviewChars: [] });
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
    const ctx = initialContext(context());
    const next = reduce("reading_offer", ctx, { type: "reading_choice", accept: false });
    expect(next.state).toBe("wrap_up");
    expect(next.effects).toEqual([{ type: "persist_session" }, { type: "show", screen: "wrap_up" }]);
  });
});

describe("终止和非法事件", () => {
  for (const state of states.filter((state) => state !== "ended")) {
    for (const type of ["time_up", "quit"] as const) {
      it(`[11] ${state}收到${type}先持久化收尾，再收到完成确认才结束`, () => {
        const ctx = freeze(initialContext(context({ queue: ["休"] })));
        const closing = reduce(state, ctx, { type });
        expect(closing.state).toBe("wrap_up");
        expect(closing.effects).toEqual([{ type: "persist_session" }, { type: "show", screen: "wrap_up" }]);
        const ended = reduce(closing.state, closing.ctx, { type: "essay_step_done" });
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
    { type: "essay_step_done" }, { type: "time_up" }, { type: "quit" },
  ];
  const allowed: Record<SessionState, SessionEvent["type"][]> = {
    idle: ["start"], homework_capture: ["homework_captured"], homework_confirm: ["homework_confirmed"],
    recognize: ["recognize_result"], understand: ["understand_done"], dictation_play: ["dictation_played"],
    dictation_capture: ["dictation_photo"], dictation_compare: ["dictation_confirmed"],
    reading_offer: ["reading_choice"], reading: ["reading_done"], retell: ["retell_done"],
    essay_interview: ["essay_step_done"], essay_cards: ["essay_step_done"], essay_feedback: ["essay_step_done"],
    wrap_up: ["essay_step_done"], ended: [],
  };
  for (const state of states) {
    for (const event of events) {
      if (allowed[state].includes(event.type)
        || (state !== "ended" && (event.type === "quit" || event.type === "time_up"))) continue;
      it(`[12] ${state}不接受${event.type}，精确返回原上下文且无效果`, () => {
        const ctx = freeze(initialContext(context({ queue: ["休"] })));
        const next = reduce(state, ctx, freeze(event));
        expect(next.state).toBe(state);
        expect(next.ctx).toBe(ctx);
        expect(next.effects).toEqual([]);
      });
    }
  }

  it.each(["recognize", "understand"] as const)("[12] %s拒绝队列之外的字", (state) => {
    const ctx = initialContext(context({ queue: ["休"] }));
    const event: SessionEvent = state === "recognize"
      ? { type: "recognize_result", char: "木", result: "correct", mode: "self_report" }
      : { type: "understand_done", char: "木", result: "correct" };
    expect(reduce(state, ctx, event)).toEqual({ state, ctx, effects: [] });
  });

  it("[12] 听写确认拒绝缺项、重复或队列外的结果", () => {
    const ctx = initialContext(context({ queue: ["休", "木"] }));
    for (const chars of [["休"], ["休", "休"], ["休", "林"]]) {
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
    const run = harness([cc("休"), cc("林")], { newChars: ["休", "林"], reviewChars: [] });
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
    expect(second.ctx.stageOf).toBe(beforeSecond);
    expect(run.store.get("林")).toMatchObject({ stage: "recognize", wrongCount: 1 });
  });

  it("[14] 答对的复习字不进understand，所有新字和答错的复习字均进入且无重复", () => {
    const run = harness([
      cc("休"), cc("林"), cc("木", { stage: "review_2d" }), cc("明", { stage: "review_7d" }),
    ], { newChars: ["休", "林"], reviewChars: ["木", "明"] });
    begin(run);
    for (const [char, result] of [["休", "correct"], ["林", "wrong"], ["木", "correct"], ["明", "wrong"]] as const) {
      run.step({ type: "recognize_result", char, result, mode: "self_report" });
    }
    expect(run.state).toBe("understand");
    expect(run.ctx.queue).toEqual(["休", "林", "明"]);
  });

  it("[14] 只有答对的复习字时同时跳过理解与听写", () => {
    const run = harness([cc("木", { stage: "review_2d" })], { newChars: [], reviewChars: ["木"] });
    begin(run);
    run.step({ type: "recognize_result", char: "木", result: "correct", mode: "self_report" });
    expect(run.state).toBe("reading_offer");
    expect(run.visited).toEqual(["homework_capture", "homework_confirm", "recognize", "reading_offer"]);
    expect(run.store.get("木")).toMatchObject({ stage: "review_7d", nextReviewOn: "2026-12-06" });
  });

  it("[14] 认读答错的新字不伪造晋级，实际通过两次学习活动后才进入听写", () => {
    const run = harness();
    begin(run);
    run.step({ type: "recognize_result", char: "休", result: "wrong", mode: "self_report" });
    expect(run.store.get("休")?.stage).toBe("recognize");
    const wrong = run.step({ type: "understand_done", char: "休", result: "wrong" });
    expect(wrong.state).toBe("understand");
    run.step({ type: "understand_done", char: "休", result: "correct" });
    expect(run.state).toBe("understand");
    expect(run.store.get("休")?.stage).toBe("understand");
    run.step({ type: "understand_done", char: "休", result: "correct" });
    expect(run.state).toBe("dictation_play");
    expect(run.store.get("休")?.stage).toBe("write");
    run.step({ type: "dictation_played" });
    run.step({ type: "dictation_photo", imageUrl: "https://example.invalid/fictional.png" });
    run.step({ type: "dictation_confirmed", results: [{ char: "休", result: "wrong" }] });
    expect(run.store.get("休")).toMatchObject({ stage: "understand", wrongCount: 3 });
  });
});

it("[7] initialContext独立复制全部嵌套输入，不借用可变的调用者数据", () => {
  const source = freeze(context({ homework: [{ id: "fictional-item", text: "练习认字", kind: "recognize", supported: true, done: false }] }));
  const result = initialContext(source);
  expect(result).toMatchObject(source);
  for (const key of ["plan", "queue", "stageOf", "kindOf", "homework"] as const) expect(result[key]).not.toBe(source[key]);
  expect(result.plan.newChars).not.toBe(source.plan.newChars);
  expect(result.plan.reviewChars).not.toBe(source.plan.reviewChars);
  expect(result.homework[0]).not.toBe(source.homework[0]);
});

it("[7] 效果仅包含已知数据，听写照片地址和当前字传给外层，不拼提示词", () => {
  const ctx = initialContext(context({ queue: ["休"] }));
  const next = reduce("dictation_capture", freeze(ctx), { type: "dictation_photo", imageUrl: "https://example.invalid/fictional.png" });
  expect(next.effects).toEqual([
    { type: "call_agent", agent: "vision_dictation", payload: { imageUrl: "https://example.invalid/fictional.png", expectedWords: ["休"] } },
    { type: "show", screen: "dictation_compare" },
  ]);
  expect(next.ctx.stageOf).toEqual(ctx.stageOf);
});
