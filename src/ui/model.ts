import { z } from "zod";
import { CharCard, DictationMark, HomeworkItem } from "../contracts/schemas";
import { SessionStateSchema, type SessionState } from "../contracts/orchestrator";

const char = z.string().length(1);
const approvedCard = CharCard.refine(card => card.status === "approved");
const dataSchemas = {
  homework_confirm: z.object({ items: z.array(HomeworkItem) }),
  recognize: z.object({ char, word: z.string().optional() }),
  understand: z.object({ card: approvedCard, say: z.string().max(80), ask: z.string().max(60).nullable() }),
  dictation_play: z.object({ cards: z.array(approvedCard).min(1) }),
  dictation_compare: z.object({ imageUrl: z.string().regex(/^data:image\/(jpeg|png);base64,/), chars: z.array(char).min(1), marks: z.array(DictationMark) }),
  wrap_up: z.object({ learned: z.array(char), revisit: z.array(char) }),
};
export type ScreenData = { [K in keyof typeof dataSchemas]: z.infer<(typeof dataSchemas)[K]> };
export type View = { [K in SessionState]: K extends keyof ScreenData ? { screen: K; data: ScreenData[K] } : { screen: K } }[SessionState];
export const PacketSchema = z.object({ sessionId: z.string().optional(), state: SessionStateSchema, effects: z.array(z.unknown()) });
export type Packet = z.infer<typeof PacketSchema>;
export type ScreenDecoder = (packet: Packet) => View;

/** 本地适配约定，尚非服务端契约；只消费验证后的 show 数据。 */
export const decodeScreen: ScreenDecoder = packet => {
  if (packet.state === "ended") return { screen: "ended" };
  const show = [...packet.effects].reverse().find(effect => {
    const parsed = z.object({ type: z.literal("show"), screen: SessionStateSchema }).safeParse(effect);
    return parsed.success && parsed.data.screen === packet.state;
  });
  if (!show) throw new Error("missing_screen");
  if (packet.state in dataSchemas) {
    const schema = dataSchemas[packet.state as keyof typeof dataSchemas];
    const data = schema.parse((show as { data?: unknown }).data);
    if (packet.state === "recognize") {
      const recognize = data as ScreenData["recognize"];
      if (recognize.word && !recognize.word.includes(recognize.char)) throw new Error("missing_char");
    }
    if (packet.state === "dictation_compare") {
      const compare = data as ScreenData["dictation_compare"];
      if (new Set(compare.chars).size !== compare.chars.length || compare.chars.some(c => !compare.marks.some(m => m.expected === c))) throw new Error("missing_marks");
    }
    return { screen: packet.state, data } as View;
  }
  return { screen: packet.state } as View;
};
