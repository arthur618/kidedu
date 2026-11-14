import { SPEECH_MAX_RECORDING_MS, SPEECH_MAX_AUDIO_BYTES } from '../../contracts/speech';
import { recordingMime, type SpeechClient } from './client';
export type RecordingState = 'idle' | 'permission' | 'recording' | 'transcribing';
export interface RecorderEnvironment {
  getUserMedia: () => Promise<MediaStream>;
  recorder: typeof MediaRecorder;
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
}
export const recordingFallback = '这次没听清，写在这里也可以。';
/** generation同时隔离权限、录制和转录；任何退出或编辑都使旧工作失效。 */
export class MemoryRecorder {
  private generation = 0;
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private timer?: ReturnType<typeof setTimeout>;
  private abort?: AbortController;
  private started = 0;
  constructor(private env: RecorderEnvironment, private client: SpeechClient, private state: (value: RecordingState, message?: string) => void, private text: (value: string) => void, private preview: (blob: Blob) => void = () => {}) {}
  cancel() {
    ++this.generation;
    this.abort?.abort(); this.abort = undefined;
    if (this.timer !== undefined) this.env.clearTimeout(this.timer); this.timer = undefined;
    if (this.recorder) { this.recorder.ondataavailable = null; this.recorder.onstop = null; this.recorder.onerror = null; if (this.recorder.state !== 'inactive') { try { this.recorder.stop(); } catch {} } }
    this.recorder = undefined;
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = undefined;
  }
  reset() { this.cancel(); this.state('idle'); }
  async start() {
    this.cancel(); const generation = this.generation;
    const current = () => generation === this.generation;
    this.state('permission');
    try {
      const mime = recordingMime(this.env.recorder); if (!mime) throw new Error();
      const stream = await this.env.getUserMedia();
      if (!current()) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      const recorder = new this.env.recorder(stream, { mimeType: mime }); this.recorder = recorder;
      const chunks: Blob[] = []; let size = 0;
      recorder.ondataavailable = event => { if (current() && event.data.size) { size += event.data.size; if (size > SPEECH_MAX_AUDIO_BYTES) { chunks.length = 0; this.cancel(); this.state('idle', recordingFallback); return; } chunks.push(event.data); } };
      recorder.onerror = () => { if (current()) { this.cancel(); this.state('idle', recordingFallback); } };
      recorder.onstop = () => {
        if (!current()) return;
        this.stream?.getTracks().forEach(track => track.stop()); this.stream = undefined;
        if (this.timer !== undefined) this.env.clearTimeout(this.timer); this.timer = undefined;
        this.recorder = undefined;
        const duration = Math.min(SPEECH_MAX_RECORDING_MS, Math.max(1, Math.round(this.env.now() - this.started)));
        const blob = new Blob(chunks, { type: mime }); chunks.length = 0;
        if (blob.size) this.preview(blob);
        this.abort = new AbortController(); this.state('transcribing');
        void this.client.transcribe(blob, duration, this.abort.signal).then(text => {
          if (!current()) return;
          this.abort = undefined;
          this.state('idle', text ? '看看有没有听错，再点下面的按钮。' : recordingFallback);
          if (text) this.text(text);
        }).catch(() => { if (current()) this.state('idle', recordingFallback); });
      };
      this.started = this.env.now(); recorder.start(); this.state('recording');
      this.timer = this.env.setTimeout(() => { if (current()) this.stop(); }, SPEECH_MAX_RECORDING_MS);
    } catch { if (current()) { this.cancel(); this.state('idle', recordingFallback); } }
  }
  stop() { if (this.recorder?.state === 'recording') { try { this.recorder.stop(); } catch { this.cancel(); this.state('idle', recordingFallback); } } }
}
