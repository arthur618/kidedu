import { readSpeechBody } from './http';
import type { SpeechServiceDeps } from '../contracts/speech';
import { SPEECH_MAX_AUDIO_BYTES, SPEECH_MAX_RECORDING_MS, SpeechTranscriptSchema } from '../contracts/speech';
import { speechBudget, speechTimers, type SpeechTimers } from './service';
import { inspectPcmWav } from './wav';
export const DEEPSEEK_ASR_URL = 'https://api.deepseek.com/v1/tools/asr';
export const DEEPSEEK_TTS_URL = 'https://api.deepseek.com/v1/tools/tts';
export const SPEECH_MAX_CONCURRENT = 2;
export function createDeepSeekSpeech(options: { getEnv?: (name: string) => string | undefined; fetch?: typeof fetch; timers?: SpeechTimers } = {}): Pick<SpeechServiceDeps, 'asr' | 'tts'> {
  const env = options.getEnv ?? (name => process.env[name]);
  const key = env('DEEPSEEK_API_KEY')?.trim();
  if (env('DEEPSEEK_SPEECH_ENABLED') !== 'true' || !key) return { asr: null, tts: null };
  const fetcher = options.fetch ?? fetch; const timers = options.timers ?? speechTimers; let active = 0;
  function limited<T>(run: (signal: AbortSignal) => Promise<T | null>, signal?: AbortSignal): Promise<T | null> {
    if (signal?.aborted || active >= SPEECH_MAX_CONCURRENT) return Promise.resolve(null);
    ++active; let started = false;
    // 非合作网络保持占位，避免超时后不断叠加收费请求。
    return speechBudget(async s => { started = true; try { return await run(s); } catch { return null; } finally { --active; } }, signal, timers).finally(() => { if (!started) --active; });
  }
  async function send(url: string, body: BodyInit, signal: AbortSignal, json = false) {
    const response = await fetcher(url, { method: 'POST', redirect: 'error', cache: 'no-store', signal, headers: { Authorization: `Bearer ${key}`, ...(json ? { 'Content-Type': 'application/json' } : {}) }, body });
    if (!response.ok || signal.aborted) { void response.body?.cancel().catch(() => {}); return null; } return response;
  }
  return {
    asr: { transcribe(bytes, _hint, opts) {
      const wav = opts?.mimeType === 'audio/wav' ? inspectPcmWav(bytes, true) : null;
      if (!wav) return Promise.resolve(null);
      return limited(async signal => {
        const form = new FormData(); form.append('file', new Blob([new Uint8Array(bytes)], { type: 'audio/wav' }), 'speech.wav');
        const response = await send(DEEPSEEK_ASR_URL, form, signal);
        if (!response) return null;
        if (response.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') { void response.body?.cancel().catch(() => {}); return null; }
        const data = await readSpeechBody(response, 65536, signal); if (!data) return null;
        let raw: { text?: unknown; duration_ms?: unknown }; try { raw = JSON.parse(new TextDecoder().decode(data)); } catch { return null; }
        if (!raw || typeof raw.duration_ms !== 'number' || !Number.isFinite(raw.duration_ms) || raw.duration_ms <= 0 || raw.duration_ms > SPEECH_MAX_RECORDING_MS || Math.abs(raw.duration_ms - wav.durationMs) > 100) return null;
        if (typeof raw.text === 'string' && (raw.text.includes(key) || /authorization|bearer/i.test(raw.text))) return null;
        const parsed = SpeechTranscriptSchema.safeParse({ text: raw.text, pinyin: [] }); return parsed.success ? parsed.data : null;
      }, opts?.signal);
    } },
    tts: { synthesize(text, opts) {
      if (!text.trim() || text.length > 10000) return Promise.resolve(null);
      return limited(async signal => {
        const response = await send(DEEPSEEK_TTS_URL, JSON.stringify({ text, voice_id: 'stella', format: 'wav' }), signal, true);
        if (!response) return null;
        if (response.headers.get('content-type')?.split(';')[0]?.trim() !== 'audio/wav') { void response.body?.cancel().catch(() => {}); return null; }
        const bytes = await readSpeechBody(response, SPEECH_MAX_AUDIO_BYTES, signal);
        return bytes && inspectPcmWav(bytes) ? { bytes, mimeType: 'audio/wav' as const } : null;
      }, opts?.signal);
    } },
  };
}
