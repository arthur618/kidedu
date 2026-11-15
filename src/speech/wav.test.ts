import { it, expect } from 'vitest';
import { encodeAsrWav, inspectPcmWav } from './wav';
import { SPEECH_MAX_AUDIO_BYTES } from '../contracts/speech';
it('PCM16手算头/平均声道/48k→16k时间窗/饱和采样/真实时长', () => {
  const wav = encodeAsrWav([new Float32Array([-2,-2,-2,0,0,0,2,2,2]),new Float32Array([-2,-2,-2,1,1,1,2,2,2])],48000)!;
  expect(wav.length).toBe(50); expect(inspectPcmWav(wav,true)).toEqual({sampleRate:16000,frames:3,durationMs:3/16});
  const v=new DataView(wav.buffer); expect([v.getInt16(44,true),v.getInt16(46,true),v.getInt16(48,true)]).toEqual([-32768,16384,32767]);
  expect(v.getUint32(4,true)).toBe(42);expect(v.getUint32(28,true)).toBe(32000);expect(v.getUint32(40,true)).toBe(6);
});
it('首版规范WAV严格拒绝坏magic/长度/扩展fmt/立体声/位深/帧/超时长/空/超大', () => {
 const wav=encodeAsrWav([new Float32Array(16000)],16000)!;
 for(const [offset,value] of [[0,0],[4,0],[16,18],[20,3],[22,2],[24,1],[28,1],[32,4],[34,8],[36,0],[40,1]]) { const bad=wav.slice();bad[offset!]=value!;expect(inspectPcmWav(bad,true)).toBeNull(); }
 expect(inspectPcmWav(wav.subarray(0,-1))).toBeNull();expect(inspectPcmWav(new Uint8Array())).toBeNull();expect(inspectPcmWav(new Uint8Array(SPEECH_MAX_AUDIO_BYTES+1))).toBeNull();
 expect(encodeAsrWav([new Float32Array(480001)],16000)).toBeNull();expect(encodeAsrWav([new Float32Array([NaN])],16000)).toBeNull();expect(encodeAsrWav([],16000)).toBeNull();
 expect(inspectPcmWav(encodeAsrWav([new Float32Array(480000)],16000)!,true)?.durationMs).toBe(30000);
 const long=new Uint8Array(960046);long.set(wav.subarray(0,44));const view=new DataView(long.buffer);view.setUint32(4,long.length-8,true);view.setUint32(40,long.length-44,true);expect(inspectPcmWav(long,true)).toBeNull();
});
