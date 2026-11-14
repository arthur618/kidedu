/** 契约2.3：供应商无关语音接口。C8A不配置真实供应商，不改变学习状态机。 */
import { z } from "zod";
import type { SpeechToText } from "./llm";
import type { CharCard } from "./schemas";

export const SPEECH_MAX_AUDIO_BYTES = 2 * 1024 * 1024;
export const SPEECH_MAX_RECORDING_MS = 30_000;
export const SPEECH_SERVICE_TIMEOUT_MS = 8_000;
export const SPEECH_CLIENT_TIMEOUT_MS = 12_000;
export const SpeechMimeSchema = z.enum(["audio/webm", "audio/ogg", "audio/mp4", "audio/wav", "audio/mpeg"]);
export type SpeechMime = z.infer<typeof SpeechMimeSchema>;
export const SpeechCapabilitiesSchema = z.object({ asr: z.boolean(), tts: z.boolean() });
export type SpeechCapabilities = z.infer<typeof SpeechCapabilitiesSchema>;
export const SpeechTranscriptSchema = z.object({ text: z.string().trim().min(1).max(2000), pinyin: z.array(z.string().max(80)).max(1000) });
export type SpeechTranscript = z.infer<typeof SpeechTranscriptSchema>;

/** HTTP只接受base64正文，不接受URL；实际解码长度/规范编码由服务端再次核对。 */
export const SpeechTranscribeBodySchema = z.object({
  mimeType: SpeechMimeSchema,
  audioBase64: z.string().min(4).max(4 * Math.ceil(SPEECH_MAX_AUDIO_BYTES / 3)),
  durationMs: z.number().int().positive().max(SPEECH_MAX_RECORDING_MS),
}).strict();
export const SpeechTranscribeResultSchema = z.discriminatedUnion("status", [
  SpeechTranscriptSchema.extend({ status: z.literal("ok") }),
  z.object({ status: z.literal("unavailable") }),
]);
export type SpeechTranscribeResult = z.infer<typeof SpeechTranscribeResultSchema>;
export const SpeechSynthesizeBodySchema = z.object({ char: z.string().length(1) }).strict();
export const SpeechUnavailableSchema = z.object({ status: z.literal("unavailable") });

/** 仅内存传递，不落盘；返回音频也须非空且不超过2MB。 */
export interface SpeechAudio { bytes: Uint8Array; mimeType: SpeechMime }
export interface TextToSpeech {
  synthesize(text: string, options?: { signal?: AbortSignal }): Promise<SpeechAudio | null>;
}
export interface SpeechServiceDeps {
  asr: SpeechToText | null;
  tts: TextToSpeech | null;
  getCharCard: (char: string) => Promise<CharCard | null>;
}
