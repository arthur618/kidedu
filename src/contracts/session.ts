/** 契约版本 2.2：HTTP 孩子端响应；不改变纯编排器 Effect 的含义。 */
import { z } from "zod";
import { EssayInterviewScreenSchema, EssayCardsScreenSchema, EssayFeedbackScreenSchema } from "./essay";
import { ReadingScreenSchema, RetellScreenSchema } from "./reading";
import { CharCard, DictationMark, HomeworkItem } from "./schemas";
import { SessionStateSchema, type SessionState } from "./orchestrator";

const char = z.string().length(1);
export const ApprovedCharCard = CharCard.refine(card => card.status === "approved");

/** 服务端执行完效果后填充；字词知识只取 approved 内容。 */
export const SessionScreenDataSchemas = {
  essay_interview: EssayInterviewScreenSchema,
  essay_cards: EssayCardsScreenSchema,
  essay_feedback: EssayFeedbackScreenSchema,
  reading: ReadingScreenSchema,
  retell: RetellScreenSchema,
  homework_confirm: z.object({ items: z.array(HomeworkItem) }),
  recognize: z.object({ char, word: z.string().optional() }).refine(data => !data.word || data.word.includes(data.char)),
  understand: z.object({ card: ApprovedCharCard, say: z.string().max(80), ask: z.string().max(60).nullable() }),
  dictation_play: z.object({ cards: z.array(ApprovedCharCard).min(1) }),
  dictation_compare: z.object({
    imageUrl: z.string().regex(/^data:image\/(jpeg|png);base64,/),
    chars: z.array(char).min(1), marks: z.array(DictationMark),
  }).refine(data => new Set(data.chars).size === data.chars.length
    && data.chars.every(c => data.marks.some(mark => mark.expected === c))),
  wrap_up: z.object({ learned: z.array(char), revisit: z.array(char) }),
};
export type SessionScreenData = { [K in keyof typeof SessionScreenDataSchemas]: z.infer<(typeof SessionScreenDataSchemas)[K]> };

/** 缺内容/重启后缺原图时的安全呈现；不构造假字卡、不自动记对错。 */
export const SessionUnavailableSchema = z.object({
  reason: z.enum(["missing_content", "photo_not_available"]),
  say: z.string().min(1).max(80),
});
export const SessionShowEffectSchema = z.object({ type: z.literal("show"), screen: SessionStateSchema, data: z.unknown().optional() });

/** 对外只返回已执行完毕的 show，不把 call_agent 等内部命令交给孩子端执行。 */
export const SessionPacketSchema = z.object({
  sessionId: z.string().min(1).optional(),
  state: SessionStateSchema,
  effects: z.array(SessionShowEffectSchema),
  notice: z.string().max(80).optional(),
  unavailable: SessionUnavailableSchema.optional(),
}).superRefine((packet, ctx) => {
  if (packet.state === "ended" || packet.unavailable) return;
  const show = [...packet.effects].reverse().find(effect => effect.screen === packet.state);
  if (!show) { ctx.addIssue({ code: "custom", message: "当前状态缺少显示数据。" }); return; }
  if (packet.state in SessionScreenDataSchemas) {
    const schema = SessionScreenDataSchemas[packet.state as keyof SessionScreenData];
    if (!schema.safeParse(show.data).success) ctx.addIssue({ code: "custom", message: "当前屏幕数据不符合契约。" });
  }
});
export type SessionPacket = z.infer<typeof SessionPacketSchema>;
export type SessionScreenView = { [K in SessionState]: K extends keyof SessionScreenData
  ? { screen: K; data: SessionScreenData[K] } : { screen: K } }[SessionState];

/** 每个用户操作一个标识；同一操作的网络重试必须复用，下一操作重新生成。 */
export const SESSION_REQUEST_ID_HEADER = "Idempotency-Key";
export const SessionRequestIdSchema = z.string().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/);
/** 服务端外部效果总预算100秒，客户端120秒；都必须可注入时钟/定时器测试。 */
export const SESSION_SERVER_BUDGET_MS = 100_000;
export const SESSION_CLIENT_TIMEOUT_MS = 120_000;
