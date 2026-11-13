/**
 * 契约文件：编排器状态机与间隔复习排期。实现见任务 C1。
 * 编排器是纯函数：不调模型、不读写数据库、不取当前时间（时间从参数传入）。
 */
import type { CharKind, CharStage, ChildChar, HomeworkItem } from "./schemas";

/* ---------- 间隔复习 ---------- */

export type CharResult = "correct" | "wrong";

/**
 * 规则（C1 必须逐条用测试覆盖）：
 * 1. recognize 答对 → understand；答错 → 留在 recognize，wrongCount+1。
 * 2. understand 答对 → kind 为 write 时进 write，否则进 review_2d（nextReviewOn = today+2）。
 * 3. write 答对 → review_2d（today+2）；答错 → 回到 understand，wrongCount+1。
 * 4. review_2d 答对 → review_7d（today+7）；答错 → 回到 understand，wrongCount+1，correctStreak 清零。
 * 5. review_7d 答对 → mastered（nextReviewOn = null）；答错 → 同第 4 条的答错。
 * 6. mastered 不再变化。
 * 7. 每次答对 correctStreak+1；lastSeenOn 总是更新为 today。
 * 8. 未到 nextReviewOn 的复习字不出现在当天任务里；过期未复习的照常出现，不惩罚。
 */
export type AdvanceChar = (cc: ChildChar, result: CharResult, today: string) => ChildChar;

export interface DailyPlan {
  newChars: string[]; // 今天课内的新字
  reviewChars: string[]; // 到期要复习的字
}

/**
 * 规则：
 * - 新字不设上限（跟课本走）。课内的字如果已经在 all 里且 stage 不是 recognize，不算新字。
 * - 复习字 = stage 为 review_2d / review_7d 且 nextReviewOn <= today 的字；最多 12 个，
 *   优先 wrongCount 高的，并列时按字的 Unicode 码点升序。
 */
export type PlanDay = (all: ChildChar[], lessonChars: { char: string; kind: CharKind }[], today: string) => DailyPlan;

/* ---------- 会话状态机 ---------- */

export type SessionState =
  | "idle"
  | "homework_capture" // 拍下或说出作业
  | "homework_confirm" // 孩子确认清单
  | "recognize" // 认读
  | "understand" // 字卡讲解 + 组词造句
  | "dictation_play" // 报词
  | "dictation_capture" // 拍照
  | "dictation_compare" // 并排对照，孩子确认
  | "reading_offer" // 问要不要读短文（可选）
  | "reading" // 读短文
  | "retell" // 讲给小问号听
  | "essay_interview"
  | "essay_cards"
  | "essay_feedback"
  | "wrap_up"
  | "ended";

export type SessionEvent =
  | { type: "start"; hasEssayToday: boolean }
  | { type: "homework_captured" }
  | { type: "homework_confirmed"; items: HomeworkItem[] }
  | { type: "recognize_result"; char: string; result: CharResult; mode: "asr" | "self_report" }
  | { type: "understand_done"; char: string; result: CharResult }
  | { type: "dictation_played" }
  | { type: "dictation_photo"; imageUrl: string }
  | { type: "dictation_confirmed"; results: { char: string; result: CharResult }[] }
  | { type: "reading_choice"; accept: boolean }
  | { type: "reading_done" }
  | { type: "retell_done" }
  | { type: "essay_step_done" }
  | { type: "time_up" } // 达到每日时长上限
  | { type: "quit" };

export interface SessionContext {
  sessionId: string;
  childId: string;
  today: string;
  plan: DailyPlan;
  queue: string[]; // 当前关卡里还没做完的字
  stageOf: Record<string, CharStage>;
  kindOf: Record<string, CharKind>;
  homework: HomeworkItem[];
  elapsedMinutes: number;
  limitMinutes: number;
}

/** 编排器让外层去做的事。外层执行后把结果作为下一个事件传回。 */
export type Effect =
  | { type: "call_agent"; agent: "vision_homework" | "vision_dictation" | "char_coach" | "reader" | "essay"; payload: unknown }
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
 * - 任何状态收到 time_up 或 quit → wrap_up → ended，并发出 persist_session。
 * - start：hasEssayToday 为 true 时，认字环节结束后进入 essay_interview，否则进入 reading_offer。
 * - recognize 队列做完后，把答错的字和所有新字送入 understand；understand 做完后，
 *   kind 为 write 的字进入 dictation_play，没有要写的字则跳过整个听写。
 * - reading_choice.accept 为 false → wrap_up。
 * - 非法事件（当前状态不接受的事件）不改变状态，effects 为空，不抛异常。
 */
export type Reduce = (state: SessionState, ctx: SessionContext, event: SessionEvent) => Transition;
