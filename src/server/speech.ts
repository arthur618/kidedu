import { getCharCard } from '../db/charCard';
import { SPEECH_MAX_AUDIO_BYTES, SpeechTranscribeBodySchema, SpeechSynthesizeBodySchema, type SpeechServiceDeps } from '../contracts/speech';
import { createSpeechService, type SpeechTimers } from '../speech/service';
const unavailable = (status = 200) => Response.json({ status: 'unavailable' }, { status, headers: { 'Cache-Control': 'no-store' } });
export function createSpeechHandlers(deps: SpeechServiceDeps, timers?: SpeechTimers) {
  const service = createSpeechService(deps, timers);
  return {
    capabilities: () => Response.json(service.capabilities(), { headers: { 'Cache-Control': 'no-store' } }),
    async transcribe(request: Request) {
      let raw: unknown; try { raw = await request.json(); } catch { return unavailable(400); }
      const body = SpeechTranscribeBodySchema.safeParse(raw);
      if (!body.success) return unavailable(400);
      const encoded = body.data.audioBase64;
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return unavailable(400);
      const bytes = Buffer.from(encoded, 'base64');
      if (!bytes.length || bytes.length > SPEECH_MAX_AUDIO_BYTES || bytes.toString('base64') !== encoded) return unavailable(400);
      const result = await service.transcribe(bytes, body.data.mimeType, request.signal);
      return result ? Response.json({ status: 'ok', ...result }, { headers: { 'Cache-Control': 'no-store' } }) : unavailable();
    },
    async synthesize(request: Request) {
      let raw: unknown; try { raw = await request.json(); } catch { return unavailable(400); }
      const body = SpeechSynthesizeBodySchema.safeParse(raw);
      if (!body.success) return unavailable(400);
      const result = await service.synthesize(body.data.char, request.signal);
      return result ? new Response(new Uint8Array(result.bytes), { headers: { 'Content-Type': result.mimeType, 'Cache-Control': 'no-store' } }) : unavailable();
    },
  };
}
// 真实供应商由C8B接入；没有请求参数、环境变量或生产假服务入口。
export const productionSpeechHandlers = createSpeechHandlers({ asr: null, tts: null, getCharCard });
