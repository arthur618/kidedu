import { SPEECH_MAX_AUDIO_BYTES } from '../../contracts/speech';
import { encodeAsrWav, inspectPcmWav } from '../../speech/wav';
/** 只在内存中解码；取消先关闭AudioContext，迟到解码不得上传。 */
export async function recordingToWav(blob: Blob, signal: AbortSignal): Promise<{ blob: Blob; durationMs: number } | null> {
  if (signal.aborted || !blob.size || blob.size > SPEECH_MAX_AUDIO_BYTES || typeof AudioContext === 'undefined') return null;
  let context: AudioContext | undefined;
  const close = () => { if (context && context.state !== 'closed') void context.close().catch(() => {}); };
  signal.addEventListener('abort', close, { once: true });
  try {
    context = new AudioContext();
    const bytes = await blob.arrayBuffer(); if (signal.aborted) return null;
    const audio = await context.decodeAudioData(bytes); if (signal.aborted || audio.duration > 30) return null;
    const wav = encodeAsrWav(Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i)), audio.sampleRate);
    const info = wav && inspectPcmWav(wav, true);
    return wav && info && !signal.aborted ? { blob: new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), durationMs: Math.max(1, Math.ceil(info.durationMs)) } : null;
  } catch { return null; }
  finally { signal.removeEventListener('abort', close); close(); }
}
