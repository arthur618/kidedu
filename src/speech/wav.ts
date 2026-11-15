import { SPEECH_MAX_AUDIO_BYTES, SPEECH_MAX_RECORDING_MS } from '../contracts/speech';
export const ASR_SAMPLE_RATE = 16000;
/** 首版只接受44字节标准PCM16头；拒绝额外chunk、扩展fmt、未知长度流头。 */
export function inspectPcmWav(bytes: Uint8Array, asr = false): { sampleRate: number; frames: number; durationMs: number } | null {
  if (bytes.length < 46 || bytes.length > SPEECH_MAX_AUDIO_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number, value: string) => [...value].every((char, i) => bytes[offset + i] === char.charCodeAt(0));
  if (!tag(0, 'RIFF') || view.getUint32(4, true) !== bytes.length - 8 || !tag(8, 'WAVE') || !tag(12, 'fmt ') || view.getUint32(16, true) !== 16 || view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 || view.getUint16(34, true) !== 16 || view.getUint16(32, true) !== 2 || !tag(36, 'data')) return null;
  const sampleRate = view.getUint32(24, true); const size = view.getUint32(40, true);
  if (!(asr ? sampleRate === ASR_SAMPLE_RATE : [8000, 16000, 22050, 24000, 32000, 44100, 48000].includes(sampleRate)) || view.getUint32(28, true) !== sampleRate * 2 || size !== bytes.length - 44 || size % 2 !== 0) return null;
  const frames = size / 2; const durationMs = frames * 1000 / sampleRate;
  return durationMs > 0 && durationMs <= SPEECH_MAX_RECORDING_MS ? { sampleRate, frames, durationMs } : null;
}
/** 先对多声道取均值，再用时间窗积分重采样；不改变原始录音的MIME。 */
export function encodeAsrWav(channels: readonly Float32Array[], sampleRate: number): Uint8Array | null {
  const length = channels[0]?.length ?? 0;
  if (!length || !Number.isFinite(sampleRate) || sampleRate <= 0 || channels.length > 32 || channels.some(c => c.length !== length) || length / sampleRate > 30) return null;
  const frames = Math.floor(length * ASR_SAMPLE_RATE / sampleRate);
  if (!frames || frames * 2 + 44 > SPEECH_MAX_AUDIO_BYTES) return null;
  const bytes = new Uint8Array(44 + frames * 2); const view = new DataView(bytes.buffer);
  const tag = (offset: number, value: string) => [...value].forEach((c, i) => { bytes[offset + i] = c.charCodeAt(0); });
  tag(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); tag(8, 'WAVEfmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, ASR_SAMPLE_RATE, true); view.setUint32(28, ASR_SAMPLE_RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); tag(36, 'data'); view.setUint32(40, frames * 2, true);
  const ratio = sampleRate / ASR_SAMPLE_RATE;
  for (let i = 0; i < frames; ++i) {
    const begin = i * ratio; const end = (i + 1) * ratio; let sum = 0;
    for (let j = Math.floor(begin); j < Math.ceil(end); ++j) {
      const weight = Math.min(end, j + 1) - Math.max(begin, j);
      for (const channel of channels) { const value = channel[Math.min(j, length - 1)]!; if (!Number.isFinite(value)) return null; sum += value * weight; }
    }
    const value = Math.max(-1, Math.min(1, sum / ratio / channels.length));
    view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}
