import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSpeechHandlers, productionSpeechHandlers } from '../server/speech';
import { createSpeechService } from './service';
import { SPEECH_MAX_AUDIO_BYTES, SPEECH_MAX_RECORDING_MS, SPEECH_SERVICE_TIMEOUT_MS, type SpeechServiceDeps } from '../contracts/speech';
import { testCard } from '../db/test-fixtures';
const audio = Buffer.from('fictional-speech-only');
const body = { mimeType: 'audio/webm', audioBase64: audio.toString('base64'), durationMs: 100 };
const request = (value: unknown, signal?: AbortSignal) => new Request('http://localhost/api/speech', { method: 'POST', body: JSON.stringify(value), signal });
const deps = (): SpeechServiceDeps => ({ asr: { transcribe: vi.fn(async () => ({ text: '我想读书', pinyin: ['wo'] })) }, tts: { synthesize: vi.fn(async () => ({ bytes: audio, mimeType: 'audio/wav' as const })) }, getCharCard: vi.fn(async () => testCard) });
afterEach(() => vi.useRealTimers());
describe('C8A语音边界', () => {
  it('[1] 生产能力关闭，无网络或供应商调用', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error());
    try { expect(await productionSpeechHandlers.capabilities().json()).toEqual({ asr: false, tts: false }); expect(await (await productionSpeechHandlers.transcribe(request(body))).json()).toEqual({ status: 'unavailable' }); expect(await (await productionSpeechHandlers.synthesize(request({ char: '休' }))).json()).toEqual({ status: 'unavailable' }); expect(spy).not.toHaveBeenCalled(); } finally { spy.mockRestore(); }
  });
  it('[2] MIME/base64/字节数/声明时长全部正反边界，拒绝URL及额外字段', async () => {
    const d = deps(); const h = createSpeechHandlers(d);
    for (const value of [{ ...body, mimeType: 'audio/flac' }, { ...body, audioBase64: '' }, { ...body, audioBase64: 'YR==' }, { ...body, audioBase64: 'data:audio/wav;base64,YQ==' }, { ...body, audioBase64: 'https://example.invalid/a' }, { ...body, durationMs: 0 }, { ...body, durationMs: SPEECH_MAX_RECORDING_MS + 1 }, { ...body, durationMs: 1.1 }, { ...body, url: 'https://example.invalid/a' }, { ...body, audioBase64: Buffer.alloc(SPEECH_MAX_AUDIO_BYTES + 1).toString('base64') }]) expect((await h.transcribe(request(value))).status).toBe(400);
    for (const mimeType of ['audio/webm', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/mpeg']) expect((await h.transcribe(request({ ...body, mimeType }))).status).toBe(200);
    for (const durationMs of [1, SPEECH_MAX_RECORDING_MS]) expect((await h.transcribe(request({ ...body, durationMs }))).status).toBe(200);
    expect((await h.transcribe(request({ ...body, audioBase64: Buffer.alloc(SPEECH_MAX_AUDIO_BYTES, 9).toString('base64') }))).status).toBe(200);
  });
  it('[3] ASR成功经过schema裁剪；空/坏/拒绝/异常/回显媒体均unavailable', async () => {
    for (const output of [null, { text: '', pinyin: [] }, { text: '词', pinyin: 'bad' }, { text: body.audioBase64, pinyin: [] }, { text: JSON.stringify([...audio]), pinyin: [] }, { text: 'data:audio/wav;base64,YQ==', pinyin: [] }]) {
      const d = deps(); d.asr = { transcribe: async () => output as never }; expect(await (await createSpeechHandlers(d).transcribe(request(body))).json()).toEqual({ status: 'unavailable' });
    }
    const d = deps(); d.asr = { transcribe: async () => { throw { audioBase64: body.audioBase64 }; } }; expect(await (await createSpeechHandlers(d).transcribe(request(body))).json()).toEqual({ status: 'unavailable' });
    d.asr = { transcribe: async () => ({ text: '我想读书', pinyin: [], rawAudio: body.audioBase64 } as never) }; expect(await (await createSpeechHandlers(d).transcribe(request(body))).json()).toEqual({ status: 'ok', text: '我想读书', pinyin: [] });
  });
  it('[3] 8秒硬预算取消ASR信号，迟到无结果；外部取消也立即结束', async () => {
    vi.useFakeTimers(); let signal: AbortSignal | undefined; let resolve!: (value: { text: string; pinyin: string[] }) => void;
    const d = deps(); d.asr = { transcribe: (_a, _h, options) => { signal = options?.signal; return new Promise(r => { resolve = r; }); } };
    const service = createSpeechService(d); const pending = service.transcribe(audio, 'audio/wav'); await vi.advanceTimersByTimeAsync(SPEECH_SERVICE_TIMEOUT_MS); expect(await pending).toBeNull(); expect(signal?.aborted).toBe(true); resolve({ text: '迟到', pinyin: [] }); expect(vi.getTimerCount()).toBe(0);
    const abort = new AbortController(); const next = service.transcribe(audio, 'audio/wav', abort.signal); await Promise.resolve(); abort.abort(); expect(await next).toBeNull(); expect(signal?.aborted).toBe(true);
  });
  it('[4] 只用approved卡的报词，拒绝draft/缺卡/任意text；正确二进制头', async () => {
    const d = deps(); const h = createSpeechHandlers(d); const response = await h.synthesize(request({ char: testCard.char })); expect(response.headers.get('content-type')).toBe('audio/wav'); expect(response.headers.get('cache-control')).toBe('no-store'); expect(Buffer.from(await response.arrayBuffer())).toEqual(audio); expect(d.tts!.synthesize).toHaveBeenCalledWith(testCard.dictationContext, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    const spy = d.tts!.synthesize as ReturnType<typeof vi.fn>; spy.mockClear();
    expect((await h.synthesize(request({ char: testCard.char, text: '任意文字' }))).status).toBe(400);
    for (const card of [null, { ...testCard, status: 'draft' as const }]) { d.getCharCard = async () => card; expect(await createSpeechService(d).synthesize(testCard.char)).toBeNull(); }
    expect(spy).not.toHaveBeenCalled();
  });
  it('[4/8] TTS空/过大/坏格式/拒绝/异常/超时及取消都失败退路', async () => {
    const d = deps();
    for (const output of [null, { bytes: new Uint8Array(), mimeType: 'audio/wav' }, { bytes: new Uint8Array(SPEECH_MAX_AUDIO_BYTES + 1), mimeType: 'audio/wav' }, { bytes: audio, mimeType: 'text/plain' }]) { d.tts = { synthesize: async () => output as never }; expect(await createSpeechService(d).synthesize(testCard.char)).toBeNull(); }
    d.tts = { synthesize: async () => { throw new Error(); } }; expect(await createSpeechService(d).synthesize(testCard.char)).toBeNull();
    vi.useFakeTimers(); let signal: AbortSignal | undefined; d.tts = { synthesize: (_text, options) => { signal = options?.signal; return new Promise(() => {}); } }; const pending = createSpeechService(d).synthesize(testCard.char); await vi.advanceTimersByTimeAsync(8000); expect(await pending).toBeNull(); expect(signal?.aborted).toBe(true);
    const abort = new AbortController(); const cancelled = createSpeechService(d).synthesize(testCard.char, abort.signal); await Promise.resolve(); abort.abort(); expect(await cancelled).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });
});
