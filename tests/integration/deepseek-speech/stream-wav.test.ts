import { afterEach, expect, it, vi } from 'vitest';
import { createDeepSeekSpeech } from '../../../src/speech/deepseek';
import { encodeAsrWav, inspectPcmWav } from '../../../src/speech/wav';
import { SPEECH_MAX_AUDIO_BYTES } from '../../../src/contracts/speech';
const canonical = encodeAsrWav([new Float32Array([0.2, -0.1, 0.3])], 16000)!;
function sentinel(bytes = canonical) {
  const copy = bytes.slice(); const view = new DataView(copy.buffer);
  view.setUint32(4, 0xffffffff, true); view.setUint32(40, 0xffffffff, true); return copy;
}
const headers = { 'content-type': 'audio/wav' };
const provider = (response: Response) => createDeepSeekSpeech({
  getEnv: name => name === 'DEEPSEEK_SPEECH_ENABLED' ? 'true' : name === 'DEEPSEEK_API_KEY' ? 'C8C_FAKE_KEY' : undefined,
  fetch: async () => response,
});
const synthesize = (response: Response) => provider(response).tts!.synthesize('合成测试');
afterEach(() => vi.useRealTimers());
it.each([1, 3])('双sentinel分%d块直到EOF才成功且PCM原样/输入不变', async chunks => {
  const bytes = sentinel(); const original = bytes.slice(); let finish!: () => void;
  const response = new Response(new ReadableStream({ start(c) {
    for (let i = 0; i < chunks; ++i) c.enqueue(bytes.subarray(Math.floor(i * bytes.length / chunks), Math.floor((i + 1) * bytes.length / chunks)));
    finish = () => c.close();
  } }), { headers });
  let resolved = false; const pending = synthesize(response).then(result => { resolved = true; return result; });
  await new Promise(resolve => setTimeout(resolve, 0)); expect(resolved).toBe(false);
  finish(); const result = await pending; expect(result?.bytes).toEqual(canonical); expect(result?.mimeType).toBe('audio/wav');
  expect(inspectPcmWav(result!.bytes)).not.toBeNull(); expect(bytes).toEqual(original);
  expect((await synthesize(new Response(canonical.slice(), { headers })))?.bytes).toEqual(canonical);
});
it('双sentinel不豁免坏头/混合sentinel/其他未知值/奇帧/空/超时长/超大小', async () => {
  const bad: Uint8Array[] = [];
  for (const [offset, value, width] of [[0,0,4],[8,0,4],[12,0,4],[16,18,4],[20,3,2],[22,2,2],[24,1,4],[28,1,4],[32,4,2],[34,8,2],[36,0,4],[4,42,4],[40,6,4],[4,0xfffffffe,4],[40,0xfffffffe,4]]) {
    const copy = sentinel(); const view = new DataView(copy.buffer);
    if (width === 2) view.setUint16(offset!,value!,true); else view.setUint32(offset!,value!,true); bad.push(copy);
  }
  bad.push(sentinel().slice(0,-1), sentinel().slice(0,44), canonical.slice(0,-2));
  const long = new Uint8Array(44 + 16000 * 30 * 2 + 2); long.set(canonical.subarray(0,44)); bad.push(sentinel(long));
  const large = new Uint8Array(SPEECH_MAX_AUDIO_BYTES + 1); large.set(canonical); bad.push(sentinel(large));
  for (const bytes of bad) expect(await synthesize(new Response(new Uint8Array(bytes), { headers }))).toBeNull();
});
it('流错误和Content-Length不符不能成为成功EOF', async () => {
  for (const length of ['0','invalid',String(canonical.length-2),String(canonical.length+2),String(SPEECH_MAX_AUDIO_BYTES+1)]) {
    expect(await synthesize(new Response(sentinel(), { headers: { ...headers, 'content-length': length } }))).toBeNull();
  }
  let fail!: () => void;
  const pending = synthesize(new Response(new ReadableStream({ start(c) { c.enqueue(sentinel()); fail = () => c.error(new Error('synthetic stream error')); } }), { headers }));
  await Promise.resolve(); fail(); expect(await pending).toBeNull();
  expect((await synthesize(new Response(sentinel(), {headers:{...headers,'content-length':String(canonical.length)}})))?.bytes).toEqual(canonical);
});
it.each(['abort','timeout'])('双sentinel已收到但未EOF时%s仍拒绝并取消reader', async mode => {
  vi.useFakeTimers(); const cancel = vi.fn(); const controller = new AbortController();
  const p = provider(new Response(new ReadableStream({ start(c) { c.enqueue(sentinel()); }, cancel }), { headers }));
  const pending = p.tts!.synthesize('合成测试', { signal: controller.signal });
  await vi.advanceTimersByTimeAsync(0);
  if (mode === 'abort') controller.abort(); else await vi.advanceTimersByTimeAsync(8000);
  expect(await pending).toBeNull(); expect(cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
it('ASR双sentinel上传仍拒绝且未配置保持零网络', async () => {
  const fetcher = vi.fn();
  const enabled = createDeepSeekSpeech({ getEnv: n => n === 'DEEPSEEK_SPEECH_ENABLED' ? 'true' : 'C8C_FAKE_KEY', fetch: fetcher });
  expect(await enabled.asr!.transcribe(sentinel(), undefined, { mimeType: 'audio/wav' })).toBeNull();
  const disabled = createDeepSeekSpeech({getEnv: () => undefined, fetch: fetcher}); expect(disabled).toEqual({ asr: null, tts: null }); expect(fetcher).not.toHaveBeenCalled();
});
