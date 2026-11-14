/** 契约2.5：素材卡只保留孩子原话；全文不进入公共屏幕或Turn。 */
import { z } from "zod";
import { Id, IsoDateTime, EssayInput, EssayOutput } from "./schemas";

export const EssayMaterialCardSchema = z.object({
  id: Id,
  text: z.string().min(1).max(2000),
  sourceUtterance: z.number().int().min(0).max(4),
  selected: z.boolean(),
}).strict();
export type EssayMaterialCard = z.infer<typeof EssayMaterialCardSchema>;
const placeholder = z.object({ mode: z.literal("placeholder") }).strict();
export const EssayInterviewScreenSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("ready"), topic: z.string().min(1), say: z.string().max(80), ask: z.string().max(60).nullable(), remaining: z.number().int().min(0).max(5) }).strict(),
  placeholder,
]).default({ mode: "placeholder" });
export const EssayCardsScreenSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("ready"), topic: z.string().min(1), cards: z.array(EssayMaterialCardSchema).max(5) }).strict(),
  placeholder,
]).default({ mode: "placeholder" });
export const EssayFeedbackScreenSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("ready"), say: z.string().max(80), ask: z.string().min(1).max(60), quote: z.string().min(1).max(40) }).strict(),
  placeholder,
]).default({ mode: "placeholder" });
export const EssayActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("answer"), text: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ type: z.literal("select_card"), cardId: Id, selected: z.boolean() }).strict(),
  z.object({ type: z.literal("delete_card"), cardId: Id }).strict(),
  z.object({ type: z.literal("submit_essay"), text: z.string().trim().min(1).max(10000) }).strict(),
]);

/** 仅DB/服务端；utterances和essayText保存明确提交的孩子文字。 */
export const EssayRuntimeSchema = z.object({
  topic: z.string().min(1),
  homeworkItemId: Id,
  phase: z.enum(["interview", "cards", "feedback", "complete", "abandoned"]),
  utterances: z.array(z.string().min(1).max(2000)).max(5),
  cards: z.array(EssayMaterialCardSchema).max(5),
  history: EssayInput.shape.history,
  essayText: z.string().min(1).max(10000).nullable(),
  output: EssayOutput.nullable(),
  feedbackQuote: z.string().min(1).max(40).nullable(),
  startedAt: IsoDateTime,
  completedAt: IsoDateTime.nullable(),
}).strict();
export type EssayRuntime = z.infer<typeof EssayRuntimeSchema>;
