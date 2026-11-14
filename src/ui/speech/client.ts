import { SPEECH_CLIENT_TIMEOUT_MS, SPEECH_MAX_AUDIO_BYTES, SpeechCapabilitiesSchema, SpeechMimeSchema, SpeechTranscribeResultSchema, type SpeechCapabilities, type SpeechMime } from '../../contracts/speech';
export const disabledSpeech: SpeechCapabilities = { asr: false, tts: false };
export function createSpeechClient(fetcher: typeof fetch = fetch, timeoutMs = SPEECH_CLIENT_TIMEOUT_MS) {
  async function request(path: string, body?: unknown, signal?: AbortSignal): Promise<Response | null> {
    if (signal?.aborted) return null;
    const controller = new AbortController();
    let done!: (value: null) => void;
    const cancelled = new Promise<null>(resolve => { done = resolve; });
    const cancel = () => { controller.abort(); done(null); };
    signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, timeoutMs);
    try { return await Promise.race([fetcher(`/api/speech/${path}`, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', signal: controller.signal, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }).then(async response => new Response(await response.arrayBuffer(), { status: response.status, headers: response.headers })).catch(() => null), cancelled]); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
  }
  return {
    async capabilities(signal?: AbortSignal) { try { const response = await request('capabilities', undefined, signal); return SpeechCapabilitiesSchema.parse(await response?.json()); } catch { return disabledSpeech; } },
    async transcribe(blob: Blob, durationMs: number, signal?: AbortSignal) {
      if (!blob.size || blob.size > SPEECH_MAX_AUDIO_BYTES || signal?.aborted) return null;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (signal?.aborted) return null;
      let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
      try { const response = await request('transcribe', { audioBase64: btoa(binary), mimeType: blob.type.split(';')[0], durationMs }, signal); const parsed = SpeechTranscribeResultSchema.parse(await response?.json()); return parsed.status === 'ok' && !signal?.aborted ? parsed.text : null; } catch { return null; }
    },
    async synthesize(char: string, signal?: AbortSignal) {
      try {
        const response = await request('synthesize', { char }, signal);
        if (!response?.ok || !SpeechMimeSchema.safeParse(response.headers.get('content-type')?.split(';')[0]).success) return null;
        const blob = await response.blob();
        return !signal?.aborted && blob.size > 0 && blob.size <= SPEECH_MAX_AUDIO_BYTES ? blob : null;
      } catch { return null; }
    },
  };
}
export type SpeechClient = ReturnType<typeof createSpeechClient>;
export function recordingMime(recorder: typeof MediaRecorder): SpeechMime | null {
  return SpeechMimeSchema.options.find(mime => recorder.isTypeSupported(mime)) ?? null;
}
