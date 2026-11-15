import { SPEECH_CLIENT_TIMEOUT_MS, SPEECH_MAX_AUDIO_BYTES, SpeechCapabilitiesSchema, SpeechMimeSchema, SpeechTranscribeResultSchema, type SpeechCapabilities, type SpeechMime } from '../../contracts/speech';
import { readSpeechBody } from '../../speech/http';
import { recordingToWav } from './wav';
export const disabledSpeech: SpeechCapabilities = { asr: false, tts: false };
export function createSpeechClient(fetcher: typeof fetch = fetch, timeoutMs = SPEECH_CLIENT_TIMEOUT_MS, convert = recordingToWav) {
  async function operation<T>(run: (signal: AbortSignal) => Promise<T | null>, signal?: AbortSignal): Promise<T | null> {
    if (signal?.aborted) return null;
    const controller = new AbortController(); let done!: (value: null) => void;
    const cancelled = new Promise<null>(resolve => { done = resolve; });
    const cancel = () => { controller.abort(); done(null); };
    signal?.addEventListener('abort', cancel, { once: true }); const timer = setTimeout(cancel, timeoutMs);
    try { return await Promise.race([Promise.resolve().then(() => controller.signal.aborted ? null : run(controller.signal)).catch(() => null), cancelled]); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); controller.abort(); }
  }
  async function request(path: string, body: unknown, signal: AbortSignal, max = 65536): Promise<Response | null> {
    if (signal.aborted) return null;
    const response = await fetcher(`/api/speech/${path}`, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', signal, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    if (!response.ok || signal.aborted) { void response.body?.cancel().catch(() => {}); return null; }
    const bytes = await readSpeechBody(response, max, signal);
    return bytes ? new Response(new Uint8Array(bytes), { status: response.status, headers: response.headers }) : null;
  }
  return {
    async capabilities(signal?: AbortSignal) {
      return await operation(async s => { const response = await request('capabilities', undefined, s); return SpeechCapabilitiesSchema.parse(await response?.json()); }, signal) ?? disabledSpeech;
    },
    transcribe(blob: Blob, _durationMs: number, signal?: AbortSignal) {
      return operation(async s => {
        const normalized = await convert(blob, s); if (!normalized || s.aborted) return null;
        const bytes = new Uint8Array(await normalized.blob.arrayBuffer()); if (s.aborted) return null;
        let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
        const response = await request('transcribe', { audioBase64: btoa(binary), mimeType: normalized.blob.type, durationMs: normalized.durationMs }, s);
        const parsed = SpeechTranscribeResultSchema.parse(await response?.json()); return parsed.status === 'ok' && !s.aborted ? parsed.text : null;
      }, signal);
    },
    synthesize(char: string, signal?: AbortSignal) {
      return operation(async s => {
        const response = await request('synthesize', { char }, s, SPEECH_MAX_AUDIO_BYTES);
        if (!response || !SpeechMimeSchema.safeParse(response.headers.get('content-type')?.split(';')[0]).success) return null;
        const blob = await response.blob(); return !s.aborted && blob.size > 0 && blob.size <= SPEECH_MAX_AUDIO_BYTES ? blob : null;
      }, signal);
    },
  };
}
export type SpeechClient = ReturnType<typeof createSpeechClient>;
export function recordingMime(recorder: typeof MediaRecorder): SpeechMime | null {
  return SpeechMimeSchema.options.find(mime => recorder.isTypeSupported(mime)) ?? null;
}
