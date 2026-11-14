import { it, expect, vi, afterEach } from 'vitest';
import { recordingToWav } from './wav';
import { createSpeechClient } from './client';
import { inspectPcmWav } from '../../speech/wav';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('WebAudio实际接口解码结果重采样/关闭context，失败/取消同样释放',async()=>{
 const close=vi.fn(async()=>{});const decode=vi.fn(async()=>({duration:0.1,numberOfChannels:2,sampleRate:48000,getChannelData:()=>new Float32Array(4800).fill(0.5)}));
 class Context{state='running';close=close;decodeAudioData=decode;}vi.stubGlobal('AudioContext',Context);
 const source=new Blob(['fictional encoded audio'],{type:'audio/webm'});const result=await recordingToWav(source,new AbortController().signal);expect(result?.blob.type).toBe('audio/wav');expect(source.type).toBe('audio/webm');expect(inspectPcmWav(new Uint8Array(await result!.blob.arrayBuffer()),true)).toEqual({sampleRate:16000,frames:1600,durationMs:100});expect(close).toHaveBeenCalledOnce();
 decode.mockRejectedValueOnce(new Error('fictional failure'));expect(await recordingToWav(source,new AbortController().signal)).toBeNull();expect(close).toHaveBeenCalledTimes(2);
 let finish!:(value:Awaited<ReturnType<typeof decode>>)=>void;decode.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));const controller=new AbortController();const pending=recordingToWav(source,controller.signal);await new Promise(r=>setTimeout(r,0));controller.abort();expect(close).toHaveBeenCalledTimes(3);finish({duration:0.1,numberOfChannels:1,sampleRate:48000,getChannelData:()=>new Float32Array(4800)});expect(await pending).toBeNull();
});
it('转码+HTTP总共12秒；非合作解码迟到后零上传；调用取消零上传',async()=>{
 vi.useFakeTimers();const fetcher=vi.fn(async()=>Response.json({status:'ok',text:'迟到文字',pinyin:[]}));let finish!:(v:{blob:Blob;durationMs:number})=>void;let signal:AbortSignal|undefined;
 const convert=vi.fn((_blob:Blob,s:AbortSignal)=>{signal=s;return new Promise<{blob:Blob;durationMs:number}>(r=>{finish=r;});});const client=createSpeechClient(fetcher,12000,convert);const pending=client.transcribe(new Blob(['x']),1);await vi.advanceTimersByTimeAsync(12000);expect(await pending).toBeNull();expect(signal?.aborted).toBe(true);finish({blob:new Blob(['x'],{type:'audio/wav'}),durationMs:1});await vi.advanceTimersByTimeAsync(0);expect(fetcher).not.toHaveBeenCalled();
 const controller=new AbortController();const cancelled=client.transcribe(new Blob(['x']),1,controller.signal);await vi.advanceTimersByTimeAsync(0);controller.abort();expect(await cancelled).toBeNull();finish({blob:new Blob(['x']),durationMs:1});await vi.advanceTimersByTimeAsync(0);expect(fetcher).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});
it('转码用去9秒，HTTP只剩3秒；未支持/解码失败不上传',async()=>{
 vi.useFakeTimers();let signal:AbortSignal|undefined;const fetcher=vi.fn(async(_url,init)=>{signal=init!.signal as AbortSignal;return await new Promise<Response>(()=>{});}) as unknown as typeof fetch;
 const client=createSpeechClient(fetcher,12000,async blob=>{await new Promise(r=>setTimeout(r,9000));return {blob,durationMs:1};});const pending=client.transcribe(new Blob(['x'],{type:'audio/wav'}),1);await vi.advanceTimersByTimeAsync(9000);expect(fetcher).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(3000);expect(await pending).toBeNull();expect(signal?.aborted).toBe(true);
 const no=vi.fn();expect(await createSpeechClient(no).transcribe(new Blob(['bad']),1)).toBeNull();expect(no).not.toHaveBeenCalled();
});
