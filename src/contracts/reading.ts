/** 契约2.4：阅读公共投影与服务端活动。参考要点不属于公共响应。 */
import { z } from "zod";
import { Id, IsoDateTime, Passage, ReaderInput, ReaderOutput } from "./schemas";

export const PublicReadingPassageSchema = Passage.pick({ id: true, title: true, body: true, targetChars: true }).strict();
export type PublicReadingPassage = z.infer<typeof PublicReadingPassageSchema>;
/** placeholder只兼容旧演示/历史包；C9生产新活动必须ready或unavailable。 */
export const ReadingScreenSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("ready"), passage: PublicReadingPassageSchema }).strict(),
  z.object({ mode: z.literal("placeholder") }).strict(),
]).default({ mode: "placeholder" });
export const RetellScreenSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("ready"), passageId: Id, phase: z.enum(["answer", "follow_up"]), say: z.string().max(80), ask: z.string().max(60).nullable() }).strict(),
  z.object({ mode: z.literal("placeholder") }).strict(),
]).default({ mode: "placeholder" });
export const ReadingActionSchema = z.object({ text: z.string().trim().min(1).max(2000) }).strict();

/** 私有活动快照，只在DB/服务端使用；不得整体返回API或写控制台/Turn。 */
export const ReadingRuntimeSchema = z.object({
  passage: Passage.extend({ status: z.literal("approved") }),
  phase: z.enum(["reading", "answer", "follow_up", "complete", "abandoned"]),
  question: z.string().max(60).nullable(),
  history: ReaderInput.shape.history,
  transcript: z.array(z.string().min(1).max(2000)).max(2),
  output: ReaderOutput.nullable(),
  startedAt: IsoDateTime,
  completedAt: IsoDateTime.nullable(),
}).strict();
export type ReadingRuntime = z.infer<typeof ReadingRuntimeSchema>;
