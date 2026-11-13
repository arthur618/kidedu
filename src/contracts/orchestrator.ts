/**
 * 契约文件：编排器状态机与间隔复习排期。实现见任务 C1。
 * 编排器是纯函数：不调模型、不读写数据库、不取当前时间（时间从参数传入）。
 *
 * 版本 2（2026-11-13）。相对版本 1 的变化见 tasks/STATUS.md 的“契约变更记录”。
 */
import { z } from "zod";
import { HomeworkItem } from "./schemas";
import type { CharKind, CharStage, ChildChar } from "./schemas";

/* ---------- 间隔复习 ---------- */

export const CharResultSchema = z.enum(["correct", "wrong"]);
export type CharResult = z.infer<typeof CharResultSchema>;

/**
 * 规则（C1 必须逐条用测试覆盖）：
 * 1. recognize：答对 → understand。答错 → 也进入 understand（不认识就去学），wrongCount+1。
 * 2. understand：答对 → kind 为 write 时进 write，否则进 review_2d（nextReviewOn = today+2）。
 *    答错 → 留在 understand，wrongCount+1。
 * 3. write：答对 → review_2d（today+2）。答错 → 回到 understand，wrongCount+1。
 * 4. review_2d：答对 → review_7d（today+7）。答错 → 回到 understand，wrongCount+1，correctStreak 清零。
 * 5. review_7d：答对 → mastered（nextReviewOn = null）。答错 → 同第 4 条的答错。
 * 6. mastered：只更新 lastSeenOn，其余字段都不变（包括 correctStreak 和 wrongCount）。
 * 7. 除 mastered 外：每次答对 correctStreak+1；lastSeenOn 总是更新为 today。
 * 8. 离开 review_2d / review_7d（无论去哪）且新阶段不是复习阶段时，nextReviewOn 置为 null。
 */
export type AdvanceChar = (cc: ChildChar, result: CharResult, today: string) => ChildChar;

/**
 * 只算阶段，不算统计。reduce 用它在会话内维护 ctx.stageOf，
 * 必须和 AdvanceChar 对 stage 的处理完全一致（C1 用测试保证两者不分叉）。
 */
export type NextStage = (stage: CharStage, kind: CharKind, result: CharResult) => CharStage;

export interface DailyPlan {
  /** 今天课内的新字：不在 all 里，或在 all 里且 stage 为 recognize。 */
  newChars: string[];
  /** 到期要复习的字：stage 为 review_2d / review_7d 且 nextReviewOn <= today。 */
  reviewChars: string[];
  /** 之前没学完的字：stage 为 understand 或 write。跳过认读，直接接着学。 */
  carryOverChars: string[];
}

/**
 * 规则：
 * - 新字不设上限（跟课本走），按 lessonChars 的顺序，去重。
 * - 复习字最多 12 个，优先 wrongCount 高的，并列时按字的 Unicode 码点升序。
 * - 遗留字最多 8 个，排序规则同复习字。已经算作新字的不重复出现。
 * - 未到期的复习字不出现；过期未复习的照常出现，不惩罚。
 */
export type PlanDay = (all: ChildChar[], lessonChars: { char: string; kind: CharKind }[], today: string) => DailyPlan;

/* ---------- 会话状态机 ---------- */

export const SessionStateSchema = z.enum([
  "idle",
  "homework_capture", // 拍下或说出作业
  "homework_confirm", // 孩子确认清单
  "recognize", // 认读
  "understand", // 字卡讲解 + 组词造句
  "dictation_play", // 报词
  "dictation_capture", // 拍照
  "dictation_compare", // 并排对照，孩子确认
  "reading_offer", // 问要不要读短文（可选）
  "reading", // 读短文
  "retell", // 讲给小问号听
  "essay_interview",
  "essay_cards",
  "essay_feedback",
  "wrap_up",
  "ended",
]);
export type SessionState = z.infer<typeof SessionStateSchema>;

/** 接口层用它校验传入的事件；不要另写一份。 */
export const SessionEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), hasEssayToday: z.boolean() }),
  z.object({ type: z.literal("homework_captured") }),
  z.object({ type: z.literal("homework_confirmed"), items: z.array(HomeworkItem) }),
  z.object({
    type: z.literal("recognize_result"),
    char: z.string().length(1),
    result: CharResultSchema,
    mode: z.enum(["asr", "self_report"]),
  }),
  z.object({ type: z.literal("understand_done"), char: z.string().length(1), result: CharResultSchema }),
  z.object({ type: z.literal("dictation_played") }),
  z.object({ type: z.literal("dictation_photo"), imageUrl: z.string() }),
  z.object({
    type: z.literal("dictation_confirmed"),
    results: z.array(z.object({ char: z.string().length(1), result: CharResultSchema })),
  }),
  z.object({ type: z.literal("reading_choice"), accept: z.boolean() }),
  z.object({ type: z.literal("reading_done") }),
  z.object({ type: z.literal("retell_done") }),
  z.object({ type: z.literal("essay_step_done") }),
  z.object({ type: z.literal("wrap_up_done") }), // 孩子点完表情，或外层保存完成
  z.object({ type: z.literal("time_up") }), // 达到每日时长上限
  z.object({ type: z.literal("quit") }),
]);
export type SessionEvent = z.infer<typeof SessionEventSchema>;

/**
 * 会话上下文。必须能 JSON 序列化后原样还原（会被存进数据库）。
 * 只有 reduce 可以产生新的上下文；外层原样保存、原样传回，不修改、不裁剪字段。
 */
export interface SessionContext {
  sessionId: string;
  childId: string;
  today: string;
  plan: DailyPlan;
  hasEssayToday: boolean;
  /** 当前关卡里还没做完的字。 */
  queue: string[];
  /** 等待进入 understand 的字（认读阶段累积）。 */
  understandQueue: string[];
  /** 等待进入听写的字（理解阶段累积）。 */
  writeQueue: string[];
  /** 本次会话里每个字已经做过几次理解活动。 */
  understandAttempts: Record<string, number>;
  /** 由 reduce 维护：每发出一条 persist_char，同时用 NextStage 更新这里。 */
  stageOf: Record<string, CharStage>;
  kindOf: Record<string, CharKind>;
  homework: HomeworkItem[];
  elapsedMinutes: number;
  limitMinutes: number;
}

/** 创建初始上下文。外层在新建会话时调用，然后发送 start 事件。 */
export type InitContext = (input: {
  sessionId: string;
  childId: string;
  today: string;
  plan: DailyPlan;
  /** 计划里出现的每个字的当前阶段和类别；新字的阶段为 recognize。 */
  stageOf: Record<string, CharStage>;
  kindOf: Record<string, CharKind>;
  limitMinutes: number;
}) => SessionContext;

/**
 * 编排器让外层去做的事。
 * call_agent 的 payload 只含编排器知道的信息，不是完整的 Agent 输入；
 * 外层负责查出字卡、孩子信息、对话历史，组装成契约里的 *Input 再调 Agent。
 */
export type Effect =
  | { type: "call_agent"; agent: "char_coach"; payload: { char: string; step: "explain" } }
  | { type: "call_agent"; agent: "vision_dictation"; payload: { imageUrl: string; chars: string[] } }
  | { type: "call_agent"; agent: "reader"; payload: { step: "ask" } }
  | { type: "call_agent"; agent: "essay"; payload: { step: "interview" | "reader_feedback" } }
  | { type: "play_audio"; chars: string[] }
  | { type: "show"; screen: SessionState; data?: unknown }
  | { type: "persist_char"; char: string; result: CharResult }
  | { type: "persist_session" }
  | { type: "end_session" };

export interface Transition {
  state: SessionState;
  ctx: SessionContext;
  effects: Effect[];
}

/**
 * 规则（C1 必须用测试覆盖）：
 * a. 非法事件（当前状态不接受的事件）不改变状态，返回原 ctx，effects 为空，不抛异常。
 * b. 除 wrap_up 和 ended 外的任何状态收到 time_up 或 quit → wrap_up，发出 persist_session。
 * c. wrap_up 收到 wrap_up_done、quit 或 time_up → ended，发出 end_session。ended 不接受任何事件。
 * d. start：记录 hasEssayToday。认字环节结束后，为 true 进入 essay_interview，否则进入 reading_offer。
 * e. homework_confirmed 之后：
 *    - 认读队列 = newChars + reviewChars（去重，新字在前）。
 *    - understandQueue 初始为 carryOverChars 里 stage 为 understand 的字；
 *      writeQueue 初始为 carryOverChars 里 stage 为 write 的字。
 *    - 认读队列为空时跳过 recognize。
 * f. recognize：每个 recognize_result 发出一条 persist_char 并更新 stageOf。
 *    新字无论对错都加入 understandQueue；复习字只有答错才加入。队列清空后进入下一步。
 * g. understand：依次处理 understandQueue。每个 understand_done 发出一条 persist_char 并更新 stageOf。
 *    答对 → 移出队列，kind 为 write 的加入 writeQueue。
 *    答错 → 同一个字再来一次；同一个字本次会话最多两次，第二次仍答错则移出队列
 *    （阶段留在 understand，明天作为遗留字继续），不加入 writeQueue。
 *    understandQueue 为空时跳过 understand。
 * h. 听写：writeQueue 为空时跳过三个 dictation 状态。dictation_confirmed 必须恰好覆盖 writeQueue
 *    里的每个字各一次，否则视为非法事件。每个结果发出一条 persist_char 并更新 stageOf。
 *    听写答错的字本次会话不再重学，明天作为遗留字继续。
 * i. reading_choice.accept 为 false → wrap_up（发出 persist_session）。
 * j. reduce 不依赖外层在两次事件之间修改 ctx。把 ctx 做 JSON 往返后继续发事件，结果必须相同。
 */
export type Reduce = (state: SessionState, ctx: SessionContext, event: SessionEvent) => Transition;
