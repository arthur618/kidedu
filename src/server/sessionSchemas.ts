import { z } from "zod";
import { HomeworkItem } from "../contracts/schemas";

const CharResultSchema = z.enum(["correct", "wrong"]);

/**
 * 契约里 SessionEvent 只有 TypeScript 类型，没有 zod schema。
 * 接口需要在调用 reduce 之前拒绝结构不对的事件，所以在这里按契约逐字写一份运行时校验。
 */
export const SessionEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), hasEssayToday: z.boolean() }).strict(),
  z.object({ type: z.literal("homework_captured") }).strict(),
  z.object({ type: z.literal("homework_confirmed"), items: z.array(HomeworkItem) }).strict(),
  z
    .object({
      type: z.literal("recognize_result"),
      char: z.string(),
      result: CharResultSchema,
      mode: z.enum(["asr", "self_report"]),
    })
    .strict(),
  z.object({ type: z.literal("understand_done"), char: z.string(), result: CharResultSchema }).strict(),
  z.object({ type: z.literal("dictation_played") }).strict(),
  z.object({ type: z.literal("dictation_photo"), imageUrl: z.string() }).strict(),
  z
    .object({
      type: z.literal("dictation_confirmed"),
      results: z.array(z.object({ char: z.string(), result: CharResultSchema }).strict()),
    })
    .strict(),
  z.object({ type: z.literal("reading_choice"), accept: z.boolean() }).strict(),
  z.object({ type: z.literal("reading_done") }).strict(),
  z.object({ type: z.literal("retell_done") }).strict(),
  z.object({ type: z.literal("essay_step_done") }).strict(),
  z.object({ type: z.literal("time_up") }).strict(),
  z.object({ type: z.literal("quit") }).strict(),
]);
