import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import { database,seed,harness,photo } from '../helpers';
import { prepare as prepareEssay,essayText } from '../essay/helpers';
import { prepare as prepareReading,canary } from '../reading/helpers';
import { createHttpHandlers } from '../../../src/server/http';
import { getPrisma,disconnectPrisma } from '../../../src/db/client';
import { getCommand,saveCommand } from '../../../src/db/sessionCommand';
import { getEssayRuntime } from '../../../src/db/essayRuntime';
import { getReadingRuntime } from '../../../src/db/readingRuntime';
import { SessionRecoveryResponseSchema } from '../../../src/contracts/session';
import { binding,resume,snapshot,connect } from './helpers';
let db:Awaited<ReturnType<typeof database>>;
beforeEach(async()=>{db=await database();await seed();});afterEach(async()=>db.cleanup());
it('Origin只同真实start/command/coverage事务创建，失败全回滚，旧start ID恢复不多会话',async()=>{
 const h=harness();await getPrisma().$executeRawUnsafe(`CREATE TRIGGER fail_origin BEFORE INSERT ON SessionOrigin BEGIN SELECT RAISE(ABORT,'synthetic fault'); END`);expect((await h.request('start',{...binding,hasEssayToday:false},undefined,h.key())).status).toBe(500);expect(await getPrisma().session.count()).toBe(0);expect(await getPrisma().sessionRuntime.count()).toBe(0);expect(await getPrisma().sessionCommand.count()).toBe(0);await getPrisma().$executeRawUnsafe('DROP TRIGGER fail_origin');
 const key=h.key();const packet=await h.post('start',{...binding,hasEssayToday:false},undefined,key);expect(await getPrisma().sessionOrigin.findMany()).toEqual([{...binding,sessionId:packet.sessionId}]);h.restart();expect((await h.post('start',{...binding,hasEssayToday:false},undefined,key)).sessionId).toBe(packet.sessionId);expect(await getPrisma().session.count()).toBe(1);
});
it('start响应丢失/刷新复用原ID；后续完整操作响应丢失仅恢复当前快照，零重做',async()=>{
 const h=harness();const c=connect(h);c.lose();await expect(c.client().start()).rejects.toThrow();const client=c.client();const packet=await client.start();expect(await getPrisma().session.count()).toBe(1);expect(c.requests[0]!.key).toBe(c.requests[1]!.key);c.lose();await expect(client.homework({spokenText:'已送达的编造作业'},'recovery-homework-0001')).rejects.toThrow();const before=await snapshot();const calls=h.fake.calls.length;const result=await c.client().start();expect(result.state).toBe('homework_confirm');expect(h.fake.calls).toHaveLength(calls);expect(await snapshot()).toEqual(before);expect(c.requests.at(-1)?.body).toEqual({...binding,operationId:'recovery-homework-0001'});
});
it('未知/foreign operation同快照零写入零模型，浏览器清pending并说明重新填写',async()=>{
 const h=harness();const c=connect(h);const client=c.client();const packet=await client.start();const other=await h.start();c.skip();await expect(client.homework({spokenText:'NOT_SENT_PRIVATE'},'missing-operation-0001')).rejects.toThrow();const before=await snapshot();const calls=h.fake.calls.length;const restored=await c.client().start();expect(restored.state).toBe('homework_capture');expect(restored.notice).toContain('请再做一次');expect([...c.memory.values.values()][0]).not.toContain('NOT_SENT_PRIVATE');expect(JSON.parse([...c.memory.values.values()][0]!).pendingRequestId).toBeNull();
 const otherCommand=(await getPrisma().sessionCommand.findFirst({where:{sessionId:other.sessionId}}))!;expect((await(await resume(h,packet.sessionId!,otherCommand.key)).json()).status).toBe('operation_missing');expect(h.fake.calls).toHaveLength(calls);expect(await snapshot()).toEqual(before);
});
it('无pending纯读不续模型/不写/不改startedAt或limit；完整/拒绝操作都当前快照',async()=>{
 const h=harness();const packet=await h.start();const id=packet.sessionId!;const oldkey=h.key();await h.post('homework',{spokenText:'编造作业'},id,oldkey);const before=await snapshot();const calls=h.fake.calls.length;
 for(const key of [undefined,oldkey]){const response=SessionRecoveryResponseSchema.parse(await(await resume(h,id,key)).json());expect(response.packet.state).toBe('homework_confirm');expect(JSON.stringify(response)).not.toMatch(/"context"|"pending"|fingerprint/);}
 expect(await snapshot()).toEqual(before);expect(h.fake.calls).toHaveLength(calls);
 const rejected=h.key();await h.request('coach',{char:'山',text:'不在理解活动'},id,rejected);const rejectedBefore=await snapshot();expect((await(await resume(h,id,rejected)).json()).packet.state).toBe('homework_confirm');expect(await snapshot()).toEqual(rejectedBefore);
});
for(const mutate of ['missing-origin','foreign-origin-child','foreign-origin-lesson','foreign-session-child','foreign-context-child','foreign-context-session','legacy','corrupt-context'] as const)it(`可信绑定 ${mutate} 统一404零恢复写入`,async()=>{
 const h=harness();const id=(await h.start()).sessionId!;const p=getPrisma();
 if(mutate==='missing-origin'||mutate==='legacy')await p.sessionOrigin.deleteMany();
 if(mutate==='foreign-origin-child')await p.sessionOrigin.update({where:{sessionId:id},data:{childId:'foreign'}});
 if(mutate==='foreign-origin-lesson')await p.sessionOrigin.update({where:{sessionId:id},data:{lessonId:'foreign'}});
 if(mutate==='foreign-session-child')await p.session.update({where:{id},data:{childId:'foreign'}});
 if(mutate.startsWith('foreign-context')){const runtime=(await h.deps.getSessionRuntime(id))!;await h.deps.saveSessionRuntime({...runtime,context:{...runtime.context,...(mutate==='foreign-context-child'?{childId:'foreign'}:{sessionId:'foreign'})}});}
 if(mutate==='corrupt-context')await p.sessionRuntime.update({where:{sessionId:id},data:{context:'{broken'}});
 const before=await snapshot();expect((await resume(h,id,h.key())).status).toBe(404);expect(await snapshot()).toEqual(before);
});
it('错误child/lesson/不存在/额外原话或照片一律拒绝，无origin猜测/补写',async()=>{
 const h=harness();const id=(await h.start()).sessionId!;const before=await snapshot();for(const extra of [{childId:'other'},{lessonId:'other'}])expect((await resume(h,id,undefined,extra)).status).toBe(404);expect((await resume(h,'unknown')).status).toBe(404);for(const extra of [{text:'PRIVATE'},{event:{type:'quit'}},{imageDataUrl:photo},{operationId:'bad'}])expect((await resume(h,id,undefined,extra)).status).toBe(400);expect(await snapshot()).toEqual(before);
});
it('prepared命令持久载荷恢复/进程重建，认字transitioned不重复reduce或流水；纯读不恢复',async()=>{
 const h=harness();const id=await h.enterUnderstand();await h.post('coach',{char:'山',text:''},id);const key=h.key();let fail=true;h.deps.beforeComplete=async()=>{if(fail){fail=false;throw new Error('synthetic complete fault');}};expect((await h.request('coach',{char:'山',text:'编造高山'},id,key)).status).toBe(500);expect((await getCommand(`session:${id}`,key))?.phase).toBe('prepared');delete h.deps.beforeComplete;h.restart();await disconnectPrisma();expect((await(await resume(h,id,key)).json()).status).toBe('ok');const before=await snapshot();const calls=h.fake.calls.length;await resume(h,id,key);expect(await snapshot()).toEqual(before);expect(h.fake.calls).toHaveLength(calls);
 const p=harness();const fresh=await p.start();const sid=fresh.sessionId!;const homework=await p.post('homework',{spokenText:'编造生字'},sid);await p.event(sid,{type:'homework_confirmed',items:(homework.effects[0]!.data as {items:[]}).items});const operation=p.key();p.deps.afterCheckpoint=async()=>{throw new Error('synthetic checkpoint');};expect((await p.request('event',{type:'recognize_result',char:'山',result:'correct',mode:'self_report'},sid,operation)).status).toBe(500);const count=await getPrisma().learningOutcome.count({where:{sessionId:sid}});const state=await p.deps.getSessionRuntime(sid);delete p.deps.afterCheckpoint;p.restart();const pure=await snapshot();await resume(p,sid);expect(await snapshot()).toEqual(pure);expect((await(await resume(p,sid,operation)).json()).packet.state).toBe(state!.state);expect(await getPrisma().learningOutcome.count({where:{sessionId:sid}})).toBe(count);
});
it('多个prepared按sequence先后，从服务端原载荷恢复，不被任意ID跳过',async()=>{
 const h=harness();const id=await h.enterUnderstand();const scope=`session:${id}`;for(const [key,text] of [['ordered-operation-0001',''],['ordered-operation-0002','编造高山']])await saveCommand({scope,key:key!,fingerprint:'test',kind:'coach',sessionId:id,phase:'prepared',pending:{body:{char:'山',text}},response:null});
 h.restart();expect((await(await resume(h,id,'ordered-operation-0002')).json()).status).toBe('ok');expect((await getCommand(scope,'ordered-operation-0001'))?.phase).toBe('complete');expect((await getCommand(scope,'ordered-operation-0002'))?.phase).toBe('complete');expect(JSON.parse((await getPrisma().coachRuntime.findUnique({where:{sessionId:id}}))!.data).history.filter((v:{role:string})=>v.role==='child')).toHaveLength(1);
});
it('阅读一条已提交回答resume不重复原话/模型，不公开参考要点',async()=>{
 const p=await prepareReading();await p.h.event(p.id,{type:'reading_choice',accept:true});await p.h.event(p.id,{type:'reading_done'});const key=p.h.key();await p.post('编造的小鸟',key);p.h.restart();const before=await snapshot();const calls=p.h.fake.calls.length;const raw=await(await resume(p.h,p.id,key)).text();expect(JSON.parse(raw).packet.state).toBe('retell');expect(raw).not.toContain(canary);expect(raw).not.toContain('history');expect(await getReadingRuntime(p.id)).toMatchObject({transcript:['编造的小鸟']});expect(await snapshot()).toEqual(before);expect(p.h.fake.calls).toHaveLength(calls);
});
it('采访prepared私有载荷/正文transitioned故障重启resume，原话卡/正文一次，完整后纯读',async()=>{
 const p=await prepareEssay();await p.enter();let fail=true;const original=p.h.deps.llm;p.h.deps.llm={async call(req){if(req.agent==='essay'&&fail){fail=false;throw new Error('synthetic model');}return original.call(req);}};const key=p.h.key();p.h.deps.beforeComplete=async()=>{throw new Error('synthetic complete');};expect((await p.post({type:'answer',text:'编造的蓝伞'},key)).status).toBe(500);delete p.h.deps.beforeComplete;const restarted=p.h.restart();await disconnectPrisma();expect((await(await resume(p.h,p.id,key)).json()).status).toBe('ok');expect((await getEssayRuntime(p.id))?.utterances).toEqual(['编造的蓝伞']);expect((await getEssayRuntime(p.id))?.cards).toHaveLength(1);await p.h.event(p.id,{type:'essay_step_done'});
 const submit=p.h.key();restarted.afterCheckpoint=async()=>{throw new Error('synthetic after body');};expect((await p.post({type:'submit_essay',text:essayText},submit)).status).toBe(500);expect((await getEssayRuntime(p.id))?.essayText).toBe(essayText);delete restarted.afterCheckpoint;p.h.restart();const restored=await(await resume(p.h,p.id,submit)).text();expect(JSON.parse(restored).packet.state).toBe('essay_feedback');expect(restored).not.toContain('虚构尾段只在私有表保存');expect(restored).not.toContain('commands');const before=await snapshot();const calls=p.h.fake.calls.length;await resume(p.h,p.id,submit);expect(await snapshot()).toEqual(before);expect(p.h.fake.calls).toHaveLength(calls);expect((await getEssayRuntime(p.id))?.utterances).toHaveLength(1);
});
it('重启丢失图片不调视觉、不把<image>当原图；退出/ended旧命令不复活',async()=>{
 const h=harness();const id=await h.enterUnderstand();await h.coachAll(id);await h.event(id,{type:'dictation_played'});const key=h.key();h.deps.afterCheckpoint=async()=>{throw new Error('synthetic photo checkpoint');};expect((await h.request('event',{type:'dictation_photo',imageUrl:photo},id,key)).status).toBe(500);delete h.deps.afterCheckpoint;h.restart();const calls=h.fake.calls.length;const packet=(await(await resume(h,id,key)).json()).packet;expect(packet.unavailable.reason).toBe('photo_not_available');expect(h.fake.calls).toHaveLength(calls);await h.event(id,{type:'quit'});await h.event(id,{type:'quit'});const before=await snapshot();expect((await(await resume(h,id,key)).json()).packet.state).toBe('ended');expect(await snapshot()).toEqual(before);expect(h.fake.calls).toHaveLength(calls);
});
it('待执行效果超时走原time_up，不重做旧学习；无pending读取不伪造time_up',async()=>{
 const h=harness();const id=await h.enterUnderstand();const scope=`session:${id}`;const key=h.key();await saveCommand({scope,key,fingerprint:'test',kind:'coach',sessionId:id,phase:'prepared',pending:{body:{char:'山',text:'编造'}},response:null});const started=(await h.deps.getSession(id))!.startedAt;h.setNow(new Date(Date.parse(started)+41*60000));const before=await snapshot();await resume(h,id);expect(await snapshot()).toEqual(before);const calls=h.fake.calls.length;expect((await(await resume(h,id,key)).json()).packet.state).toBe('wrap_up');expect(h.fake.calls).toHaveLength(calls);expect((await h.deps.getSession(id))!.startedAt).toBe(started);
});
it('resume真正未完成效果共用100秒预算，迟到模型不能补写活动或Turn',async()=>{
 const h=harness();const id=await h.enterUnderstand();const key=h.key();await saveCommand({scope:`session:${id}`,key,fingerprint:'test',kind:'coach',sessionId:id,phase:'prepared',pending:{body:{char:'山',text:''}},response:null});
 let timer!:(()=>void);let release!:(value:unknown)=>void;let clock=0;h.deps.modelOptions.nowMs=()=>clock;h.deps.modelOptions.setTimer=(fn,ms)=>{expect(ms).toBe(100000);timer=fn;return 1 as unknown as ReturnType<typeof setTimeout>;};h.deps.modelOptions.clearTimer=()=>{};h.fake.setHandler(()=>new Promise(resolve=>{release=resolve;}));const request=resume(h,id,key);await vi.waitFor(()=>expect(release).toBeTypeOf('function'));clock=100001;timer();expect((await(await request).json()).status).toBe('ok');await h.event(id,{type:'quit'});const before=await snapshot();release({say:'迟到的候选',ask:null,next:'step_done',usedCardFields:['explain']});await new Promise(resolve=>setTimeout(resolve,10));expect(await snapshot()).toEqual(before);
});
it('resume响应与console不新增私有原话/媒体/ctx，prepared原载荷仍仅留既有私有表',async()=>{
 const p=await prepareEssay();await p.enter();const key=p.h.key();p.h.deps.beforeComplete=async()=>{throw new Error('FICTIONAL_RAW_ERROR_CANARY');};await p.post({type:'answer',text:'FICTIONAL_CHILD_PRIVATE_CANARY'},key);delete p.h.deps.beforeComplete;p.h.restart();const logs:unknown[]=[];const spies=['log','error','warn','info','debug'].map(method=>vi.spyOn(console,method as 'log').mockImplementation((...args)=>{logs.push(args);}));
 try{const response=await(await resume(p.h,p.id,key)).text();for(const marker of ['FICTIONAL_RAW_ERROR_CANARY','FICTIONAL_CHILD_PRIVATE_CANARY','"context"','"commands"','"history"','"pending"','audioBase64','data:image','blob:'])expect(response).not.toContain(marker);expect(logs).toEqual([]);const before=await snapshot();await resume(p.h,p.id,key);expect(await snapshot()).toEqual(before);}finally{spies.forEach(spy=>spy.mockRestore());}
});
