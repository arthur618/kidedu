import { it, expect, vi, afterEach } from 'vitest';
import { MemoryRecorder, type RecorderEnvironment } from './recorder';
import { createSpeechClient, recordingMime, type SpeechClient } from './client';
import { SPEECH_MAX_AUDIO_BYTES, SPEECH_MAX_RECORDING_MS } from '../../contracts/speech';
class Recorder {
  static isTypeSupported = (mime: string) => mime === 'audio/webm';
  static latest: Recorder;
  state = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_stream: MediaStream, readonly options: { mimeType: string }) { Recorder.latest = this; }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['invented recording'], { type: 'audio/webm;codecs=opus' }) }); this.onstop?.(); }
}
function setup() {
  const stop = vi.fn(); const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  const env: RecorderEnvironment = { getUserMedia: vi.fn(async () => stream), recorder: Recorder as unknown as typeof MediaRecorder, now: () => Date.now(), setTimeout, clearTimeout };
  const client = { transcribe: vi.fn(async () => '我想读书') } as unknown as SpeechClient;
  const state = vi.fn(); const text = vi.fn(); const preview = vi.fn();
  const recorder = new MemoryRecorder(env, client, state, text, preview);
  return { env, client, state, text, preview, recorder, stream, stop };
}
afterEach(() => vi.useRealTimers());
it('[6/7] 录制→停止→本地试听Blob→仅填文字，MIME规范化/流/定时器释放', async () => {
  vi.useFakeTimers(); const h = setup(); await h.recorder.start(); expect(h.state).toHaveBeenLastCalledWith('recording'); expect(recordingMime(h.env.recorder)).toBe('audio/webm'); h.recorder.stop(); await Promise.resolve(); expect(h.text).toHaveBeenCalledWith('我想读书'); expect(h.preview.mock.calls[0]![0]).toBeInstanceOf(Blob); expect(h.client.transcribe).toHaveBeenCalledWith(expect.objectContaining({ type: 'audio/webm' }), 1, expect.any(AbortSignal)); expect(h.stop).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
it('[7] 晚到权限在编辑/卸载后仍stop tracks且不创建recorder', async () => {
  const h = setup(); let resolve!: (stream: MediaStream) => void; h.env.getUserMedia = () => new Promise(r => { resolve = r; }); const pending = h.recorder.start(); h.recorder.cancel(); resolve(h.stream); await pending; expect(h.stop).toHaveBeenCalledOnce(); expect(h.client.transcribe).not.toHaveBeenCalled(); expect(h.text).not.toHaveBeenCalled();
});
it('[7] 手工编辑/重录/卸载全部取消请求，不接受迟到文字', async () => {
  for (const action of ['edit', 'restart', 'unmount']) {
    const h = setup(); let resolve!: (text: string) => void; let signal: AbortSignal | undefined;
    h.client.transcribe = vi.fn((_blob, _duration, s) => { signal = s; return new Promise<string>(r => { resolve = r; }); });
    await h.recorder.start(); h.recorder.stop(); if (action === 'restart') await h.recorder.start(); else h.recorder.cancel(); expect(signal?.aborted).toBe(true); resolve('迟到文字'); await Promise.resolve(); expect(h.text).not.toHaveBeenCalled(); h.recorder.cancel();
  }
});
it('[7] 30秒自动停止、空片段/无格式/设备拒绝/录制异常/过大都保留文字退路', async () => {
  vi.useFakeTimers(); const h = setup(); await h.recorder.start(); await vi.advanceTimersByTimeAsync(SPEECH_MAX_RECORDING_MS); expect(h.stop).toHaveBeenCalledOnce(); expect(h.client.transcribe).toHaveBeenCalledWith(expect.any(Blob), 30000, expect.any(AbortSignal)); expect(vi.getTimerCount()).toBe(0);
  const denied = setup(); denied.env.getUserMedia = async () => { throw new Error(); }; await denied.recorder.start(); expect(denied.state).toHaveBeenLastCalledWith('idle', expect.any(String));
  const unsupported = setup(); unsupported.env.recorder = { isTypeSupported: () => false } as unknown as typeof MediaRecorder; await unsupported.recorder.start(); expect(unsupported.env.getUserMedia).not.toHaveBeenCalled();
  const error = setup(); await error.recorder.start(); Recorder.latest.onerror?.(); expect(error.stop).toHaveBeenCalledOnce(); expect(error.text).not.toHaveBeenCalled();
  const big = setup(); await big.recorder.start(); Recorder.latest.ondataavailable?.({ data: new Blob([new Uint8Array(SPEECH_MAX_AUDIO_BYTES + 1)]) }); expect(big.stop).toHaveBeenCalledOnce(); expect(big.client.transcribe).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  const empty = setup(); empty.client.transcribe = vi.fn(async blob => blob.size ? '文字' : null); await empty.recorder.start(); Recorder.latest.onstop?.(); await Promise.resolve(); expect(empty.text).not.toHaveBeenCalled(); expect(empty.stop).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
it('[3/7/8] 客户端12秒取消请求及body读取；能力失败禁用，ASR/TTS坏结果退路', async () => {
  vi.useFakeTimers(); const signals: AbortSignal[] = [];
  const fetcher = vi.fn((_input: unknown, options?: RequestInit) => { signals.push(options!.signal as AbortSignal); return new Promise<Response>(() => {}); }) as unknown as typeof fetch;
  const client = createSpeechClient(fetcher);
  const pending = client.transcribe(new Blob(['fictional'], { type: 'audio/webm' }), 1); await vi.advanceTimersByTimeAsync(12000); expect(await pending).toBeNull(); expect(signals[0]?.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  const caps = client.capabilities(); await vi.advanceTimersByTimeAsync(12000); expect(await caps).toEqual({ asr: false, tts: false });
  const tts = client.synthesize('休'); await vi.advanceTimersByTimeAsync(12000); expect(await tts).toBeNull(); expect(signals.every(s => s.aborted)).toBe(true);
  const bad = createSpeechClient(async () => Response.json({ status: 'ok', text: '', pinyin: [] })); expect(await bad.transcribe(new Blob(['x'], { type: 'audio/webm' }), 1)).toBeNull(); expect(await bad.synthesize('休')).toBeNull();
  const body = createSpeechClient(async () => new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'audio/wav' } })); const hung = body.synthesize('休'); await vi.advanceTimersByTimeAsync(12000); expect(await hung).toBeNull(); expect(vi.getTimerCount()).toBe(0);
});

it('[7] performance.now小数时长转成契约整数毫秒', async () => {
  const h = setup(); let tick = 0; h.env.now = () => ++tick === 1 ? 0.25 : 43.8; await h.recorder.start(); h.recorder.stop(); await Promise.resolve(); expect(h.client.transcribe).toHaveBeenCalledWith(expect.any(Blob), 44, expect.any(AbortSignal)); h.recorder.cancel();
});
