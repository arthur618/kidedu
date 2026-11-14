import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { Prisma } from '@prisma/client';
import { database, seed } from '../helpers';
import { getPrisma } from '../../../src/db/client';
import { getCharCard } from '../../../src/db/charCard';
import { createSpeechHandlers } from '../../../src/server/speech';
import { createDeepSeekSpeech } from '../../../src/speech/deepseek';
import { encodeAsrWav, inspectPcmWav } from '../../../src/speech/wav';
let db:Awaited<ReturnType<typeof database>>;let server:Server;let origin:string;let calls=0;
const canary='C8B_SYNTHETIC_AUDIO_MEMORY_CANARY';const key='C8B_FICTIONAL_ONLY_SECRET_CANARY';const wav=encodeAsrWav([new Float32Array(1600)],16000)!;wav.set(new TextEncoder().encode(canary),100);
beforeAll(async()=>{
 db=await database();await seed();server=createServer(async(req,res)=>{
 try{const pieces:Buffer[]=[];for await(const piece of req)pieces.push(Buffer.from(piece));const request=new Request(origin+req.url,{method:'POST',headers:req.headers as Record<string,string>,body:Buffer.concat(pieces)});++calls;expect(request.headers.get('authorization')).toBe(`Bearer ${key}`);
 if(req.url==='/v1/tools/asr'){const form=await request.formData();const file=form.get('file') as File;expect([...form.keys()]).toEqual(['file']);expect(new Uint8Array(await file.arrayBuffer())).toEqual(wav);res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({text:'我想读书',duration_ms:100}));}
 else{expect(await request.json()).toEqual({text:(await getCharCard('水'))!.dictationContext,voice_id:'stella',format:'wav'});res.writeHead(200,{'content-type':'audio/wav','content-length':String(wav.length)});res.write(wav.slice(0,100));res.end(wav.slice(100));}
 }catch{res.writeHead(500);res.end();}});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
afterAll(async()=>{await new Promise<void>(r=>server.close(()=>r()));await db.cleanup();});
it('真实本地HTTP multipart/分块WAV，全Prisma表与console不保存key/字节/base64/原异常',async()=>{
 expect(inspectPcmWav(wav,true)?.durationMs).toBe(100);const snapshot=()=>Promise.all(Prisma.dmmf.datamodel.models.map(model=>{const name=model.name[0]!.toLowerCase()+model.name.slice(1);return (getPrisma() as unknown as Record<string,{findMany():Promise<unknown[]>}>)[name]!.findMany();}));
 const before=await snapshot();const logs:unknown[]=[];const spies=['log','error','warn','info','debug'].map(m=>vi.spyOn(console,m as 'log').mockImplementation((...args)=>{logs.push(args);}));
 try{const p=createDeepSeekSpeech({getEnv:n=>n==='DEEPSEEK_SPEECH_ENABLED'?'true':key,fetch:async(url,init)=>fetch(origin+new URL(String(url)).pathname,init)});const h=createSpeechHandlers({...p,getCharCard});const request=(value:unknown)=>new Request('http://localhost',{method:'POST',body:JSON.stringify(value)});
 const result=await(await h.transcribe(request({mimeType:'audio/wav',audioBase64:Buffer.from(wav).toString('base64'),durationMs:100}))).json();expect(result).toEqual({status:'ok',text:'我想读书',pinyin:[]});expect(new Uint8Array(await(await h.synthesize(request({char:'水'}))).arrayBuffer())).toEqual(wav);expect(calls).toBe(2);const after=await snapshot();expect(after).toEqual(before);
 for(const marker of [canary,key,Buffer.from(wav).toString('base64'),JSON.stringify([...wav])]){expect(JSON.stringify(after)).not.toContain(marker);expect(JSON.stringify(logs)).not.toContain(marker);expect(JSON.stringify(result)).not.toContain(marker);}expect(logs).toEqual([]);
 }finally{spies.forEach(s=>s.mockRestore());}
});
