import { afterEach, expect, it, vi } from 'vitest';
import { createDeepSeekSpeech, DEEPSEEK_ASR_URL, DEEPSEEK_TTS_URL } from '../../../src/speech/deepseek';
import { encodeAsrWav } from '../../../src/speech/wav';
import { createSpeechHandlers } from '../../../src/server/speech';
import { testCard } from '../../../src/db/test-fixtures';
const key='C8B_FICTIONAL_KEY_NEVER_REAL'; const wav=encodeAsrWav([Float32Array.from({length:1600},(_,i)=>Math.sin(i/10)*0.1)],16000)!;
const env=(name:string)=>name==='DEEPSEEK_SPEECH_ENABLED'?'true':name==='DEEPSEEK_API_KEY'?key:undefined;
const request=(body:unknown,signal?:AbortSignal)=>new Request('http://localhost/api/speech',{method:'POST',body:JSON.stringify(body),signal});
const body={mimeType:'audio/wav',audioBase64:Buffer.from(wav).toString('base64'),durationMs:100};
const asr=(p:ReturnType<typeof createDeepSeekSpeech>, signal?:AbortSignal)=>p.asr!.transcribe(wav,undefined,{mimeType:'audio/wav',signal});
const json=(text='我想读书',duration_ms=100)=>Response.json({text,duration_ms});
afterEach(()=>vi.useRealTimers());
it('缺key/关闭/空白key均零网络，只有精确true启用',async()=>{
 for(const [enabled,apiKey] of [[undefined,key],['false',key],['TRUE',key],['true',''],['true','  '],['true',undefined]]){
 const fetcher=vi.fn();const p=createDeepSeekSpeech({getEnv:n=>n==='DEEPSEEK_SPEECH_ENABLED'?enabled:apiKey,fetch:fetcher});const h=createSpeechHandlers({...p,getCharCard:async()=>testCard});expect(await h.capabilities().json()).toEqual({asr:false,tts:false});expect(await(await h.transcribe(request(body))).json()).toEqual({status:'unavailable'});expect(await(await h.synthesize(request({char:testCard.char}))).json()).toEqual({status:'unavailable'});expect(fetcher).not.toHaveBeenCalled(); }
});
it('真实FormData boundary/file/规范WAV固定官方Bearer；ASR不捏造pinyin，TTS只取approved报词',async()=>{
 const calls:string[]=[]; const fetcher:typeof fetch=async(input,init)=>{
 const url=String(input);calls.push(url);expect(init?.redirect).toBe('error');expect(init?.headers).toMatchObject({Authorization:`Bearer ${key}`});
 if(url===DEEPSEEK_ASR_URL){expect(new Headers(init?.headers).has('content-type')).toBe(false);const req=new Request(url,init);expect(req.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);const form=await req.formData();expect([...form.keys()]).toEqual(['file']);const file=form.get('file') as File;expect(file.name).toBe('speech.wav');expect(file.type).toBe('audio/wav');expect(new Uint8Array(await file.arrayBuffer())).toEqual(wav);return json();}
 expect(url).toBe(DEEPSEEK_TTS_URL);expect(JSON.parse(init!.body as string)).toEqual({text:testCard.dictationContext,voice_id:'stella',format:'wav'});return new Response(new Uint8Array(wav),{headers:{'Content-Type':'audio/wav','Content-Length':String(wav.length)}});
 };
 const p=createDeepSeekSpeech({getEnv:env,fetch:fetcher});const h=createSpeechHandlers({...p,getCharCard:async()=>testCard});expect(await(await h.transcribe(request(body))).json()).toEqual({status:'ok',text:'我想读书',pinyin:[]});expect(new Uint8Array(await(await h.synthesize(request({char:testCard.char}))).arrayBuffer())).toEqual(wav);expect(calls).toEqual([DEEPSEEK_ASR_URL,DEEPSEEK_TTS_URL]);
 expect((await h.synthesize(request({char:testCard.char,text:'越权'}))).status).toBe(400);
 for(const card of [null,{...testCard,status:'draft' as const}]){const blocked=createSpeechHandlers({...p,getCharCard:async()=>card});expect(await(await blocked.synthesize(request({char:testCard.char}))).json()).toEqual({status:'unavailable'});}expect(calls).toHaveLength(2);
});
it('伪MIME/坏WAV/声明时长不能绕过真实音频；未实现变体零网络',async()=>{
 const fetcher=vi.fn(async()=>json());const p=createDeepSeekSpeech({getEnv:env,fetch:fetcher});
 for(const mimeType of ['audio/webm','audio/mp4','audio/ogg'] as const)expect(await p.asr!.transcribe(wav,undefined,{mimeType})).toBeNull();
 for(const bytes of [new Uint8Array(),new TextEncoder().encode('not wav'),wav.subarray(0,-2),new Uint8Array(2097153)])expect(await p.asr!.transcribe(bytes,undefined,{mimeType:'audio/wav'})).toBeNull();
 const long=encodeAsrWav([new Float32Array(480000)],16000)!;const invalid=new Uint8Array(long.length+2);invalid.set(long);const v=new DataView(invalid.buffer);v.setUint32(4,invalid.length-8,true);v.setUint32(40,invalid.length-44,true);
 const h=createSpeechHandlers({...p,getCharCard:async()=>testCard});expect(await(await h.transcribe(request({...body,audioBase64:Buffer.from(invalid).toString('base64'),durationMs:1}))).json()).toEqual({status:'unavailable'});expect(fetcher).not.toHaveBeenCalled();
});
it('ASR空/无效duration/伪错误/超长文本/媒体或key回显均不向客户端传播',async()=>{
 const logs:unknown[]=[];const spies=['log','error','warn','info','debug'].map(m=>vi.spyOn(console,m as 'log').mockImplementation((...args)=>{logs.push(args);}));
 try{for(const output of [{text:'',duration_ms:100},{text:'x',duration_ms:0},{text:'x',duration_ms:30001},{text:'x',duration_ms:500},{text:'x'},{text:'x'.repeat(2001),duration_ms:100},{text:key,duration_ms:100},{text:body.audioBase64,duration_ms:100},{text:'data:audio/wav;base64,SECRET',duration_ms:100}]){const p=createDeepSeekSpeech({getEnv:env,fetch:async()=>Response.json(output)});const h=createSpeechHandlers({...p,getCharCard:async()=>testCard});expect(await(await h.transcribe(request(body))).json()).toEqual({status:'unavailable'});}expect(logs).toEqual([]);}finally{spies.forEach(s=>s.mockRestore());}
});
for(const status of [400,401,403,429,503,504])it(`HTTP ${status} ASR/TTS退路且每次只调用一次`,async()=>{
 const fetcher=vi.fn(async()=>new Response(`fictional provider error ${key}`,{status}));const p=createDeepSeekSpeech({getEnv:env,fetch:fetcher});expect(await asr(p)).toBeNull();expect(await p.tts!.synthesize(testCard.dictationContext)).toBeNull();expect(fetcher).toHaveBeenCalledTimes(2);
});
it('TTS完整读取；空/截断/流异常/坏MIME/伪长度/未知流头/超大一律退路',async()=>{
 const cases=()=>[
 new Response(null,{headers:{'Content-Type':'audio/wav'}}),new Response(wav.slice(0,-2),{headers:{'Content-Type':'audio/wav'}}),new Response(new Uint8Array(wav),{headers:{'Content-Type':'audio/mpeg'}}),new Response(new Uint8Array(wav),{headers:{'Content-Type':'audio/wav','Content-Length':String(wav.length+1)}}),new Response(new Uint8Array(wav),{headers:{'Content-Type':'audio/wav','Content-Length':'2097153'}}),new Response(new Uint8Array(2097153),{headers:{'Content-Type':'audio/wav'}}),new Response(new ReadableStream({start(c){c.enqueue(wav.slice(0,100));c.error(new Error(key));}}),{headers:{'Content-Type':'audio/wav'}}),new Response(Uint8Array.from(wav,(x,i)=>i>=4&&i<8?255:x),{headers:{'Content-Type':'audio/wav'}})];
 for(const response of cases()){const p=createDeepSeekSpeech({getEnv:env,fetch:async()=>response});expect(await p.tts!.synthesize('审核过的词')).toBeNull();}
 let complete!:()=>void;const response=new Response(new ReadableStream({start(c){c.enqueue(wav.slice(0,100));complete=()=>{c.enqueue(wav.slice(100));c.close();};}}),{headers:{'Content-Type':'audio/wav'}});
 const p=createDeepSeekSpeech({getEnv:env,fetch:async()=>response});let resolved=false;const pending=p.tts!.synthesize('审核过的词').then(x=>{resolved=true;return x;});await new Promise(r=>setTimeout(r,0));expect(resolved).toBe(false);complete();expect((await pending)?.bytes).toEqual(wav);
});
it('8秒总预算/取消abort上游和reader；无自动重试/每进程最多2个不合作请求',async()=>{
 vi.useFakeTimers();const signals:AbortSignal[]=[];const fetcher=vi.fn(async(_url,init)=>{signals.push(init!.signal as AbortSignal);return await new Promise<Response>(()=>{});});const p=createDeepSeekSpeech({getEnv:env,fetch:fetcher});const a=asr(p);const b=p.tts!.synthesize('审核词');await vi.advanceTimersByTimeAsync(0);expect(await asr(p)).toBeNull();expect(fetcher).toHaveBeenCalledTimes(2);await vi.advanceTimersByTimeAsync(8000);expect(await a).toBeNull();expect(await b).toBeNull();expect(signals.every(s=>s.aborted)).toBe(true);expect(await asr(p)).toBeNull();expect(fetcher).toHaveBeenCalledTimes(2);
 const cancel=vi.fn();const q=createDeepSeekSpeech({getEnv:env,fetch:async()=>new Response(new ReadableStream({start(c){c.enqueue(wav.slice(0,100));},cancel}),{headers:{'Content-Type':'audio/wav'}})});const controller=new AbortController();const pending=q.tts!.synthesize('审核词',{signal:controller.signal});await vi.advanceTimersByTimeAsync(0);controller.abort();expect(await pending).toBeNull();expect(cancel).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});
it('取消在微任务启动前不泄漏并发位，非合作迟到结果丢弃',async()=>{
 const fetcher=vi.fn(async()=>json());const p=createDeepSeekSpeech({getEnv:env,fetch:fetcher});for(let i=0;i<3;i++){const controller=new AbortController();const pending=asr(p,controller.signal);controller.abort();expect(await pending).toBeNull();}expect(await asr(p)).toEqual({text:'我想读书',pinyin:[]});expect(fetcher).toHaveBeenCalledOnce();
 let finish!:(r:Response)=>void;const q=createDeepSeekSpeech({getEnv:env,fetch:async()=>new Promise(r=>{finish=r;})});const controller=new AbortController();const pending=asr(q,controller.signal);await Promise.resolve();controller.abort();expect(await pending).toBeNull();finish(json('迟到'));await Promise.resolve();
});
it('ASR坏JSON/MIME/超大响应和HTTP异常均安全退路；慢body受8秒预算',async()=>{
 for(const response of [new Response('{',{headers:{'content-type':'application/json'}}),new Response('{}',{headers:{'content-type':'text/plain'}}),new Response('x'.repeat(65537),{headers:{'content-type':'application/json'}})]){const p=createDeepSeekSpeech({getEnv:env,fetch:async()=>response});expect(await asr(p)).toBeNull();}
 const broken=createDeepSeekSpeech({getEnv:env,fetch:async()=>{throw new Error(key);}});expect(await asr(broken)).toBeNull();expect(await broken.tts!.synthesize('审核词')).toBeNull();
 vi.useFakeTimers();const cancel=vi.fn();const p=createDeepSeekSpeech({getEnv:env,fetch:async()=>new Response(new ReadableStream({start(){},cancel}),{headers:{'content-type':'application/json'}})});const pending=asr(p);await vi.advanceTimersByTimeAsync(8000);expect(await pending).toBeNull();expect(cancel).toHaveBeenCalledOnce();
});
