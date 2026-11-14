import { getCharCard } from '../db/charCard';
import { createDeepSeekSpeech } from '../speech/deepseek';
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
// 开关和密钥仅读服务端环境；无任意供应商地址或生产fake入口。
export const productionSpeechHandlers = createSpeechHandlers({ ...createDeepSeekSpeech(), getCharCard });
