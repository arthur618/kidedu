import type { CharResult, Effect, InitContext, Reduce, SessionContext, SessionState, Transition } from "../contracts/orchestrator";
import { nextStage } from "./schedule";

export const initContext: InitContext = (input) => ({
  sessionId: input.sessionId,
  childId: input.childId,
  today: input.today,
  plan: {
    newChars: [...input.plan.newChars],
    reviewChars: [...input.plan.reviewChars],
    carryOverChars: [...input.plan.carryOverChars],
  },
  hasEssayToday: false,
  queue: [],
  understandQueue: [],
  writeQueue: [],
  understandAttempts: {},
  stageOf: { ...input.stageOf },
  kindOf: { ...input.kindOf },
  homework: [],
  elapsedMinutes: 0,
  limitMinutes: input.limitMinutes,
});

function unique(chars: string[]): string[] {
  return [...new Set(chars)];
}

function enter(state: SessionState, ctx: SessionContext, effects: Effect[] = []): Transition {
  return { state, ctx: { ...ctx }, effects: [...effects, { type: "show", screen: state }] };
}

/** 只维护会话内阶段；外层独立执行 persist_char 来保存完整统计。 */
function withResult(ctx: SessionContext, char: string, result: CharResult): SessionContext {
  return {
    ...ctx,
    stageOf: { ...ctx.stageOf, [char]: nextStage(ctx.stageOf[char] ?? "recognize", ctx.kindOf[char] ?? "recognize_only", result) },
  };
}

function wrapUp(ctx: SessionContext, effects: Effect[] = []): Transition {
  return enter("wrap_up", { ...ctx, queue: [] }, [...effects, { type: "persist_session" }]);
}

function end(ctx: SessionContext): Transition {
  return { state: "ended", ctx: { ...ctx, queue: [] }, effects: [{ type: "end_session" }] };
}

function afterLiteracy(ctx: SessionContext, effects: Effect[] = []): Transition {
  const next = { ...ctx, queue: [], understandQueue: [], writeQueue: [] };
  return ctx.hasEssayToday
    ? enter("essay_interview", next, [...effects, { type: "call_agent", agent: "essay", payload: { step: "interview" } }])
    : enter("reading_offer", next, effects);
}

function afterUnderstand(ctx: SessionContext, effects: Effect[] = []): Transition {
  const queue = [...ctx.writeQueue];
  if (queue.length === 0) return afterLiteracy(ctx, effects);
  return enter("dictation_play", { ...ctx, queue }, [...effects, { type: "play_audio", chars: [...queue] }]);
}

function explain(ctx: SessionContext, effects: Effect[] = []): Transition {
  const queue = [...ctx.understandQueue];
  const char = queue[0];
  if (char === undefined) return afterUnderstand({ ...ctx, queue }, effects);
  return enter("understand", { ...ctx, queue }, [...effects, {
    type: "call_agent", agent: "char_coach", payload: { char, step: "explain" },
  }]);
}

export const reduce: Reduce = (state, ctx, event) => {
  const unchanged = (): Transition => ({ state, ctx, effects: [] });
  if (state === "ended") return unchanged();
  if (event.type === "time_up" || event.type === "quit") return state === "wrap_up" ? end(ctx) : wrapUp(ctx);

  switch (state) {
    case "idle":
      if (event.type !== "start") return unchanged();
      return enter("homework_capture", { ...ctx, hasEssayToday: event.hasEssayToday });
    case "homework_capture":
      if (event.type !== "homework_captured") return unchanged();
      return enter("homework_confirm", ctx);
    case "homework_confirm": {
      if (event.type !== "homework_confirmed") return unchanged();
      const next = {
        ...ctx,
        homework: event.items.map((item) => ({ ...item })),
        queue: unique([...ctx.plan.newChars, ...ctx.plan.reviewChars]),
        understandQueue: unique(ctx.plan.carryOverChars.filter((char) => ctx.stageOf[char] === "understand")),
        writeQueue: unique(ctx.plan.carryOverChars.filter((char) => ctx.stageOf[char] === "write")),
      };
      return next.queue.length > 0 ? enter("recognize", next) : explain(next);
    }
    case "recognize": {
      if (event.type !== "recognize_result" || !ctx.queue.includes(event.char)) return unchanged();
      const shouldUnderstand = ctx.plan.newChars.includes(event.char) || event.result === "wrong";
      const next = {
        ...withResult(ctx, event.char, event.result),
        queue: ctx.queue.filter((char) => char !== event.char),
        understandQueue: unique([...ctx.understandQueue, ...(shouldUnderstand ? [event.char] : [])]),
      };
      const effects: Effect[] = [{ type: "persist_char", char: event.char, result: event.result }];
      const transition = next.queue.length > 0 ? enter("recognize", next, effects) : explain(next, effects);
      return {
        ...transition,
        effects: transition.effects.map((effect) => effect.type === "show" ? {
          ...effect, data: { recognition: { char: event.char, result: event.result, mode: event.mode } },
        } : effect),
      };
    }
    case "understand": {
      if (event.type !== "understand_done" || event.char !== ctx.understandQueue[0]) return unchanged();
      const attempts = (ctx.understandAttempts[event.char] ?? 0) + 1;
      const completed = event.result === "correct" || attempts >= 2;
      const next = {
        ...withResult(ctx, event.char, event.result),
        understandAttempts: { ...ctx.understandAttempts, [event.char]: attempts },
        understandQueue: completed ? ctx.understandQueue.slice(1) : [...ctx.understandQueue],
        writeQueue: unique([...ctx.writeQueue,
          ...(event.result === "correct" && ctx.kindOf[event.char] === "write" ? [event.char] : [])]),
      };
      return explain(next, [{ type: "persist_char", char: event.char, result: event.result }]);
    }
    case "dictation_play":
      if (event.type !== "dictation_played") return unchanged();
      return enter("dictation_capture", ctx);
    case "dictation_capture":
      if (event.type !== "dictation_photo") return unchanged();
      return enter("dictation_compare", ctx, [{ type: "call_agent", agent: "vision_dictation", payload: {
        imageUrl: event.imageUrl, chars: [...ctx.writeQueue],
      } }]);
    case "dictation_compare": {
      if (event.type !== "dictation_confirmed") return unchanged();
      const chars = event.results.map(({ char }) => char);
      if (chars.length !== ctx.writeQueue.length || new Set(chars).size !== chars.length
        || !chars.every((char) => ctx.writeQueue.includes(char))) return unchanged();
      let next = ctx;
      for (const { char, result } of event.results) next = withResult(next, char, result);
      return afterLiteracy(next, event.results.map(({ char, result }) => ({ type: "persist_char", char, result })));
    }
    case "reading_offer":
      if (event.type !== "reading_choice") return unchanged();
      return event.accept
        ? enter("reading", ctx, [{ type: "call_agent", agent: "reader", payload: { step: "ask" } }])
        : wrapUp(ctx);
    case "reading":
      if (event.type !== "reading_done") return unchanged();
      return enter("retell", ctx);
    case "retell":
      if (event.type !== "retell_done") return unchanged();
      return wrapUp(ctx);
    case "essay_interview":
      if (event.type !== "essay_step_done") return unchanged();
      return enter("essay_cards", ctx);
    case "essay_cards":
      if (event.type !== "essay_step_done") return unchanged();
      return enter("essay_feedback", ctx, [{ type: "call_agent", agent: "essay", payload: { step: "reader_feedback" } }]);
    case "essay_feedback":
      if (event.type !== "essay_step_done") return unchanged();
      return wrapUp(ctx);
    case "wrap_up":
      return event.type === "wrap_up_done" ? end(ctx) : unchanged();
  }
};
