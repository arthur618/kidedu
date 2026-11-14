import { SPEECH_SERVICE_TIMEOUT_MS, SPEECH_MAX_AUDIO_BYTES, SpeechMimeSchema, SpeechTranscriptSchema, type SpeechServiceDeps } from '../contracts/speech';
export interface SpeechTimers { setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>; clearTimeout: (id: ReturnType<typeof setTimeout>) => void }
export const speechTimers: SpeechTimers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id) };
/** 每次操作独立预算；不合作的适配器迟到也只会被丢弃。 */
export async function speechBudget<T>(run: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal, timers = speechTimers): Promise<T | null> {
  if (signal?.aborted) return null;
  const controller = new AbortController();
  let finish!: (value: null) => void;
  const cancelled = new Promise<null>(resolve => { finish = resolve; });
  const cancel = () => { controller.abort(); finish(null); };
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = timers.setTimeout(cancel, SPEECH_SERVICE_TIMEOUT_MS);
  try { return await Promise.race([Promise.resolve().then(() => controller.signal.aborted ? null : run(controller.signal)).catch(() => null), cancelled]); }
  finally { timers.clearTimeout(timer); signal?.removeEventListener('abort', cancel); controller.abort(); }
}
export function createSpeechService(deps: SpeechServiceDeps, timers = speechTimers) {
  return {
    capabilities: () => ({ asr: deps.asr !== null, tts: deps.tts !== null }),
    async transcribe(bytes: Uint8Array, mimeType: import('../contracts/speech').SpeechMime, signal?: AbortSignal) {
      if (!deps.asr) return null;
      const result = await speechBudget(s => deps.asr!.transcribe(bytes, undefined, { mimeType, signal: s }), signal, timers);
      const parsed = SpeechTranscriptSchema.safeParse(result);
      if (!parsed.success) return null;
      const values = [parsed.data.text, ...parsed.data.pinyin];
      const encoded = Buffer.from(bytes).toString('base64');
      if (values.some(value => value.includes(encoded) || value.includes(JSON.stringify([...bytes])) || value.includes(bytes.join(',')) || /data:audio\/|audioBase64|blob:/i.test(value))) return null;
      return parsed.data;
    },
    async synthesize(char: string, signal?: AbortSignal) {
      if (!deps.tts) return null;
      return speechBudget(async s => {
        const card = await deps.getCharCard(char);
        if (s.aborted || !card || card.status !== 'approved' || card.char !== char || !card.dictationContext.trim()) return null;
        const result = await deps.tts!.synthesize(card.dictationContext, { signal: s });
        if (s.aborted || !result || !(result.bytes instanceof Uint8Array) || !result.bytes.length || result.bytes.length > SPEECH_MAX_AUDIO_BYTES || !SpeechMimeSchema.safeParse(result.mimeType).success) return null;
        return result;
      }, signal, timers);
    },
  };
}
