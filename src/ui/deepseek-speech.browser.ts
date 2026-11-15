import { test, expect, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { database, seed, harness } from '../../tests/integration/helpers';
import { prepare as prepareReading } from '../../tests/integration/reading/helpers';
import { setup as prepareEssay, topic } from '../../tests/integration/essay/helpers';
import { getPrisma } from '../db/client';
import { getReadingRuntime } from '../db/readingRuntime';
import { getEssayRuntime } from '../db/essayRuntime';
import { getCharCard } from '../db/charCard';
import { createSpeechHandlers } from '../server/speech';
import { createDeepSeekSpeech } from '../speech/deepseek';
import { inspectPcmWav } from '../speech/wav';
let db:Awaited<ReturnType<typeof database>>;let server:Server;let origin:string;let h:ReturnType<typeof harness>;let id:string;let mode='homework';let transcriptions=0;let uploads:{sampleRate:number;frames:number;durationMs:number;bytes:number;nonzero:boolean}[]=[];let late=false;let pending:(()=>void)[]=[];
const key='C8B_BROWSER_FICTIONAL_KEY_CANARY';
const provider=createDeepSeekSpeech({getEnv:n=>n==='DEEPSEEK_SPEECH_ENABLED'?'true':key,fetch:async(url,init)=>{
 expect(String(url)).toBe('https://api.deepseek.com/v1/tools/asr');expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${key}`);
 const request=new Request(String(url),init);const form=await request.formData();const file=form.get('file') as File;const bytes=new Uint8Array(await file.arrayBuffer());const info=inspectPcmWav(bytes,true);expect(info).not.toBeNull();expect(file.type).toBe('audio/wav');expect(bytes.length).toBe(44+info!.frames*2);const view=new DataView(bytes.buffer);let nonzero=false;for(let i=44;i<bytes.length;i+=2)if(view.getInt16(i,true)!==0)nonzero=true;
 uploads.push({...info!,bytes:bytes.length,nonzero});++transcriptions;if(late)await new Promise<void>(r=>pending.push(r));return Response.json({text:'我听见了编造的小鸟声',duration_ms:info!.durationMs});
}});
const speech=createSpeechHandlers({...provider,getCharCard});
test.beforeAll(async()=>{db=await database();server=createServer(async(incoming,outgoing)=>{
 try{const pieces:Buffer[]=[];for await(const piece of incoming)pieces.push(Buffer.from(piece));const url=new URL(incoming.url!,'http://localhost');const paths=url.pathname.split('/').filter(Boolean);const request=new Request(url,{method:incoming.method,headers:incoming.headers as Record<string,string>,...(incoming.method==='GET'?{}:{body:Buffer.concat(pieces)})});
 const result=paths[1]==='speech'?paths[2]==='capabilities'?speech.capabilities():paths[2]==='transcribe'?await speech.transcribe(request):await speech.synthesize(request):incoming.method==='GET'?await h.handlers().get(paths[2]!):await h.handlers().post(paths.length===2?'start':paths[3] as 'event'|'reading'|'essay'|'homework',request,paths[2]);outgoing.writeHead(result.status,Object.fromEntries(result.headers));outgoing.end(Buffer.from(await result.arrayBuffer()));
 }catch{outgoing.writeHead(500);outgoing.end('unavailable');}});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;});
test.afterAll(async()=>{pending.forEach(r=>r());await new Promise<void>(r=>server.close(()=>r()));await db.cleanup();});
test.beforeEach(async({page})=>{
 transcriptions=0;uploads=[];late=false;pending=[];
 await page.addInitScript(()=>{
 const state={nativeMimes:[] as string[],tracks:0,decodeCreated:0,decodeClosed:0,created:0,revoked:0};Object.assign(window,{nativeSpeech:state});
 const NativeContext=window.AudioContext;
 class DecodingContext extends NativeContext{private counted=false;constructor(...args:ConstructorParameters<typeof AudioContext>){super(...args);++state.decodeCreated;}override close(){if(!this.counted){this.counted=true;++state.decodeClosed;}return super.close();}}
 window.AudioContext=DecodingContext;
 // 只替换麦克风来源：真正的浏览器MediaStream、MediaRecorder与codec，不替换转码。
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{const context=new NativeContext({sampleRate:48000});const oscillator=context.createOscillator();oscillator.frequency.value=440;const gain=context.createGain();gain.gain.value=0.05;const destination=context.createMediaStreamDestination();oscillator.connect(gain).connect(destination);oscillator.start();await context.resume();const stream=destination.stream;for(const track of stream.getTracks()){++state.tracks;const stop=track.stop.bind(track);let stopped=false;track.stop=()=>{if(!stopped){stopped=true;--state.tracks;oscillator.stop();void context.close();}stop();};}return stream;}}});
 const start=MediaRecorder.prototype.start;MediaRecorder.prototype.start=function(...args:Parameters<MediaRecorder['start']>){state.nativeMimes.push(this.mimeType);return start.apply(this,args);};
 const create=URL.createObjectURL.bind(URL);const revoke=URL.revokeObjectURL.bind(URL);URL.createObjectURL=b=>{++state.created;return create(b);};URL.revokeObjectURL=u=>{++state.revoked;revoke(u);};
 });
 await page.route('**/api/**',async route=>{
 const url=new URL(route.request().url());const response=await route.fetch({url:origin+url.pathname+url.search});
 if(mode==='reading'&&url.pathname==='/api/session'&&route.request().method()==='POST'){const packet=await response.json();id=packet.sessionId;const runtime=(await h.deps.getSessionRuntime(id))!;await h.deps.saveSessionRuntime({...runtime,state:'reading_offer'});const snapshot=await h.handlers().get(id);await route.fulfill({status:snapshot.status,headers:Object.fromEntries(snapshot.headers),body:await snapshot.text()});}
 else {if(url.pathname==='/api/session'&&route.request().method()==='POST')id=(await response.json()).sessionId;await route.fulfill({response});}
 });
});
async function record(page:Page){await page.getByRole('button',{name:'开始说',exact:true}).click();await expect(page.getByRole('button',{name:'说好了',exact:true})).toBeVisible();await page.waitForTimeout(400);await page.getByRole('button',{name:'说好了',exact:true}).click();}
async function state(page:Page){return page.evaluate(()=>(window as unknown as {nativeSpeech:{nativeMimes:string[];tracks:number;decodeCreated:number;decodeClosed:number;created:number;revoked:number}}).nativeSpeech);}
async function verifyNative(page:Page){expect(uploads.at(-1)?.sampleRate).toBe(16000);expect(uploads.at(-1)?.nonzero).toBe(true);expect(uploads.at(-1)!.durationMs).toBeGreaterThan(200);const s=await state(page);expect(s.nativeMimes.at(-1)).toMatch(/audio\/webm/);expect(s.tracks).toBe(0);expect(s.decodeCreated).toBe(s.decodeClosed);}
for(const size of [{width:375,height:667},{width:1024,height:768}]){
 test(`C8B native codec→WAV→ASR仅填作业框/编辑取消 ${size.width}`,async({page})=>{
 mode='homework';await seed();h=harness();await page.setViewportSize(size);const logs:string[]=[];page.on('console',m=>logs.push(m.text()));await page.goto('/learn?childId=child-test-1&lessonId=c7-lesson');await page.getByRole('button',{name:'我来说',exact:true}).click();const before=await getPrisma().sessionCommand.count();await record(page);await expect(page.getByLabel('今天要做什么？')).toHaveValue('我听见了编造的小鸟声');expect(await getPrisma().sessionCommand.count()).toBe(before);await verifyNative(page);
 await page.getByLabel('今天要做什么？').fill('保留我自己改的字');late=true;await record(page);await expect.poll(()=>pending.length).toBe(1);await page.getByLabel('今天要做什么？').fill('编辑取消旧录音');pending.shift()!();await expect(page.getByLabel('今天要做什么？')).toHaveValue('编辑取消旧录音');expect((await state(page)).created).toBe((await state(page)).revoked);expect(JSON.stringify(logs)).not.toContain(key);for(const src of await page.locator('script[src]').evaluateAll(nodes=>nodes.map(n=>(n as HTMLScriptElement).src))){const script=await(await page.request.get(src)).text();for(const marker of [key,'DEEPSEEK_API_KEY','https://api.deepseek.com/v1/tools/asr'])expect(script).not.toContain(marker);}await page.getByRole('button',{name:'好了，给你看看',exact:true}).dblclick();await expect(page.getByRole('button',{name:'对的，开始',exact:true})).toBeVisible();expect(await getPrisma().sessionCommand.count()).toBe(before+1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
 test(`C8B native codec阅读复述仅确认后提交一次/后续编辑不被迟到覆盖 ${size.width}`,async({page})=>{
 mode='reading';h=(await prepareReading()).h;await page.setViewportSize(size);await page.goto('/learn?childId=child-test-1&lessonId=c7-lesson');await page.getByRole('button',{name:'想读一读',exact:true}).click();await page.getByRole('button',{name:'我读完了',exact:true}).click();await expect(page.getByLabel('我想说')).toBeVisible();const before=await getPrisma().sessionCommand.count();await record(page);await expect(page.getByLabel('我想说')).toHaveValue('我听见了编造的小鸟声');expect((await getReadingRuntime(id))?.transcript).toEqual([]);expect(await getPrisma().sessionCommand.count()).toBe(before);await verifyNative(page);
 await page.getByLabel('我想说').fill('我自己确认的复述');await page.getByRole('button',{name:'好了，听听我的',exact:true}).dblclick();await expect(page.getByText('你从哪里看出来的？',{exact:true})).toBeVisible();expect((await getReadingRuntime(id))?.transcript).toEqual(['我自己确认的复述']);expect(await getPrisma().sessionCommand.count()).toBe(before+1);late=true;await record(page);await expect.poll(()=>pending.length).toBe(1);await page.getByRole('button',{name:'今天先到这',exact:true}).click();pending.shift()!();await expect(page.getByRole('heading',{name:'今天的小收获',exact:true})).toBeVisible();const s=await state(page);expect(s.tracks).toBe(0);expect(s.decodeCreated).toBe(s.decodeClosed);expect(s.created).toBe(s.revoked);
 });
 test(`C8B native codec作文采访仅确认后留原话/正文手写保留 ${size.width}`,async({page})=>{
 mode='essay';h=await prepareEssay();await page.setViewportSize(size);await page.goto('/learn?childId=child-test-1&lessonId=c7-lesson');await page.getByRole('button',{name:'我来说',exact:true}).click();await page.getByLabel('今天要做什么？').fill(topic);await page.getByRole('button',{name:'好了，给你看看',exact:true}).click();await page.getByRole('button',{name:'对的，开始',exact:true}).click();await expect(page.getByLabel('我的想法')).toBeVisible();const before=await getPrisma().sessionCommand.count();await record(page);await expect(page.getByLabel('我的想法')).toHaveValue('我听见了编造的小鸟声');expect((await getEssayRuntime(id))?.utterances).toEqual([]);expect((await getEssayRuntime(id))?.cards).toEqual([]);expect(await getPrisma().sessionCommand.count()).toBe(before);await verifyNative(page);await page.getByLabel('我的想法').fill('我确认的小鸟声');await page.getByRole('button',{name:'把这个想法留下',exact:true}).dblclick();await expect(page.getByLabel('我的想法')).toHaveValue('');expect((await getEssayRuntime(id))?.utterances).toEqual(['我确认的小鸟声']);expect(await getPrisma().sessionCommand.count()).toBe(before+1);await page.getByRole('button',{name:'这些够了',exact:true}).click();await expect(page.getByLabel('我自己写的文章')).toBeVisible();expect(await page.getByRole('button',{name:'开始说',exact:true}).count()).toBe(0);await page.getByLabel('我自己写的文章').fill('我手写的长草稿保留在这里。');await page.getByRole('button',{name:'已选这个想法',exact:true}).click();await expect(page.getByLabel('我自己写的文章')).toHaveValue('我手写的长草稿保留在这里。');const s=await state(page);expect(s.created).toBe(s.revoked);
 });
}
