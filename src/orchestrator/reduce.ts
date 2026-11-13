import type { Effect, Reduce, SessionContext, SessionState, Transition } from "../contracts/orchestrator";

/** 用户允许的实现内扩展；所有记忆随上下文返回，可序列化，不使用闭包或全局状态。 */
export interface OrchestratorContext extends SessionContext {
  hasEssayToday: boolean;
  understandChars: string[];
  writeChars: string[];
}

export function initialContext(input: SessionContext): OrchestratorContext {
  return {
    ...input,
    plan: { newChars: [...input.plan.newChars], reviewChars: [...input.plan.reviewChars] },
    queue: [...input.queue],
    stageOf: { ...input.stageOf },
    kindOf: { ...input.kindOf },
    homework: input.homework.map((item) => ({ ...item })),
    hasEssayToday: false,
    understandChars: [],
    writeChars: [],
  };
}

function unique(chars: string[]): string[] {
  return [...new Set(chars)];
}

function contextWithMemory(ctx: SessionContext): OrchestratorContext {
  return {
    ...ctx,
    hasEssayToday: "hasEssayToday" in ctx && ctx.hasEssayToday === true,
    understandChars: "understandChars" in ctx && Array.isArray(ctx.understandChars)
      ? ctx.understandChars.filter((char): char is string => typeof char === "string")
      : [...ctx.plan.newChars],
    writeChars: "writeChars" in ctx && Array.isArray(ctx.writeChars)
      ? ctx.writeChars.filter((char): char is string => typeof char === "string")
      : [],
  };
}

function enter(state: SessionState, ctx: OrchestratorContext, effects: Effect[] = []): Transition {
  return { state, ctx, effects: [...effects, { type: "show", screen: state }] };
}

function call(agent: Extract<Effect, { type: "call_agent" }>["agent"], payload: unknown): Effect {
  return { type: "call_agent", agent, payload };
}

function wrapUp(ctx: OrchestratorContext, effects: Effect[] = []): Transition {
  return enter("wrap_up", { ...ctx, queue: [] }, [...effects, { type: "persist_session" }]);
}

function afterLiteracy(ctx: OrchestratorContext, effects: Effect[] = []): Transition {
  const next = { ...ctx, queue: [] };
  if (ctx.hasEssayToday) {
    return enter("essay_interview", next, [...effects, call("essay", { childId: ctx.childId, step: "interview" })]);
  }
  return enter("reading_offer", next, effects);
}

function afterUnderstand(ctx: OrchestratorContext, effects: Effect[] = []): Transition {
  const queue = unique(ctx.writeChars);
  if (queue.length === 0) return afterLiteracy(ctx, effects);
  return enter("dictation_play", { ...ctx, queue }, [...effects, { type: "play_audio", chars: [...queue] }]);
}

function explain(ctx: OrchestratorContext, effects: Effect[] = []): Transition {
  const char = ctx.queue[0];
  if (char === undefined) return afterUnderstand(ctx, effects);
  return enter("understand", ctx, [...effects, call("char_coach", { childId: ctx.childId, char, step: "explain" })]);
}

function afterRecognize(ctx: OrchestratorContext, effects: Effect[] = []): Transition {
  return explain({ ...ctx, queue: unique(ctx.understandChars) }, effects);
}

export const reduce: Reduce = (state, ctx, event) => {
  const unchanged = (): Transition => ({ state, ctx, effects: [] });
  if (state === "ended") return unchanged();
  if (event.type === "time_up" || event.type === "quit") return wrapUp(contextWithMemory(ctx));

  switch (state) {
    case "idle": {
      if (event.type !== "start") return unchanged();
      const next = initialContext(ctx);
      return enter("homework_capture", { ...next, hasEssayToday: event.hasEssayToday, queue: [] });
    }
    case "homework_capture":
      if (event.type !== "homework_captured") return unchanged();
      return enter("homework_confirm", contextWithMemory(ctx));
    case "homework_confirm": {
      if (event.type !== "homework_confirmed") return unchanged();
      const next = {
        ...contextWithMemory(ctx),
        homework: event.items.map((item) => ({ ...item })),
        queue: unique([...ctx.plan.newChars, ...ctx.plan.reviewChars]),
        understandChars: unique(ctx.plan.newChars),
        writeChars: [],
      };
      return next.queue.length > 0 ? enter("recognize", next) : afterRecognize(next);
    }
    case "recognize": {
      if (event.type !== "recognize_result" || !ctx.queue.includes(event.char)) return unchanged();
      const memory = contextWithMemory(ctx);
      const next = {
        ...memory,
        queue: ctx.queue.filter((char) => char !== event.char),
        understandChars: unique([...memory.understandChars, ...(event.result === "wrong" ? [event.char] : [])]),
      };
      const effects: Effect[] = [{ type: "persist_char", char: event.char, result: event.result }];
      const transition = next.queue.length > 0 ? enter("recognize", next, effects) : afterRecognize(next, effects);
      return {
        ...transition,
        effects: transition.effects.map((effect) => effect.type === "show" ? {
          ...effect, data: { recognition: { char: event.char, result: event.result, mode: event.mode } },
        } : effect),
      };
    }
    case "understand": {
      if (event.type !== "understand_done" || event.char !== ctx.queue[0]) return unchanged();
      const memory = contextWithMemory(ctx);
      // 认读答错的新字仍处于 recognize；本次答对只会由外层推进到 understand，
      // 需再完成一次理解活动，不能凭空补记一次正确结果。
      const completed = event.result === "correct" && ctx.stageOf[event.char] !== "recognize";
      const next = {
        ...memory,
        queue: completed ? ctx.queue.slice(1) : [...ctx.queue],
        writeChars: unique([...memory.writeChars,
          ...(completed && ctx.kindOf[event.char] === "write" ? [event.char] : [])]),
      };
      return explain(next, [{ type: "persist_char", char: event.char, result: event.result }]);
    }
    case "dictation_play":
      if (event.type !== "dictation_played") return unchanged();
      return enter("dictation_capture", contextWithMemory(ctx));
    case "dictation_capture":
      if (event.type !== "dictation_photo") return unchanged();
      return enter("dictation_compare", contextWithMemory(ctx), [call("vision_dictation", {
        imageUrl: event.imageUrl, expectedWords: [...ctx.queue],
      })]);
    case "dictation_compare": {
      if (event.type !== "dictation_confirmed") return unchanged();
      const chars = event.results.map(({ char }) => char);
      // 最终确认必须恰好覆盖本轮听写，不能把别的字或重复结果记入学习记录。
      if (chars.length !== ctx.queue.length || new Set(chars).size !== chars.length
        || !chars.every((char) => ctx.queue.includes(char))) return unchanged();
      return afterLiteracy(contextWithMemory(ctx), event.results.map(({ char, result }) => ({
        type: "persist_char", char, result,
      })));
    }
    case "reading_offer":
      if (event.type !== "reading_choice") return unchanged();
      return event.accept
        ? enter("reading", contextWithMemory(ctx), [call("reader", { childId: ctx.childId, step: "ask" })])
        : wrapUp(contextWithMemory(ctx));
    case "reading":
      if (event.type !== "reading_done") return unchanged();
      return enter("retell", contextWithMemory(ctx));
    case "retell":
      if (event.type !== "retell_done") return unchanged();
      return wrapUp(contextWithMemory(ctx));
    case "essay_interview":
      if (event.type !== "essay_step_done") return unchanged();
      return enter("essay_cards", contextWithMemory(ctx));
    case "essay_cards":
      if (event.type !== "essay_step_done") return unchanged();
      return enter("essay_feedback", contextWithMemory(ctx), [call("essay", { childId: ctx.childId, step: "reader_feedback" })]);
    case "essay_feedback":
      if (event.type !== "essay_step_done") return unchanged();
      return wrapUp(contextWithMemory(ctx));
    case "wrap_up":
      // 契约没有收尾完成事件，使用现有的步骤完成事件作为外层保存后的确认。
      if (event.type !== "essay_step_done") return unchanged();
      return { state: "ended", ctx: { ...contextWithMemory(ctx), queue: [] }, effects: [{ type: "end_session" }] };
  }
};
