import { expect, it, vi } from 'vitest';
import { createRecoveryStore, type RecoveryStorage } from './store';
import type { SessionRecoveryHint } from '../../contracts/session';
export function memoryStorage() { const values=new Map<string,string>();const storage:RecoveryStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);},removeItem:k=>{values.delete(k);}};return {storage,values}; }
const hint:SessionRecoveryHint={version:1,childId:'a',lessonId:'b',hasEssayToday:false,startRequestId:'start-request-0001',sessionId:'session-1',pendingRequestId:'pending-request-0001'};
it('strict hint仅标识、child/lesson分开、8KiB及新旧/损坏schema边界',()=>{
 const m=memoryStorage();const store=createRecoveryStore('a','b',()=>m.storage);store.save(hint);expect(store.load()).toEqual(hint);expect(createRecoveryStore('a','other',()=>m.storage).load()).toBeNull();const key=[...m.values.keys()][0]!;
 for(const raw of ['{','x'.repeat(8193),JSON.stringify({...hint,version:0}),JSON.stringify({...hint,text:'PRIVATE'}),JSON.stringify({...hint,childId:'foreign'}),JSON.stringify({...hint,startRequestId:'bad'}),JSON.stringify({...hint,sessionId:null}),JSON.stringify({...hint,lessonId:'x'.repeat(8192)})]){m.values.set(key,raw);expect(store.load()).toBeNull();expect(m.values.size).toBe(0);}
 store.save({...hint,extra:'PRIVATE'} as SessionRecoveryHint);expect(m.values.size).toBe(0);store.save({...hint,lessonId:'x'.repeat(8192)});expect(m.values.size).toBe(0);store.save(hint);store.clear();expect(m.values.size).toBe(0);
});
it('SSR/禁用get/set/remove/额度异常均无日志且不阻断',()=>{
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});try{for(const storage of [()=>null,()=>{throw new Error('PRIVATE');},()=>({getItem(){throw new Error('PRIVATE');},setItem(){throw new Error('PRIVATE');},removeItem(){throw new Error('PRIVATE');}})]){const store=createRecoveryStore('a','b',storage);expect(store.load()).toBeNull();expect(()=>store.save(hint)).not.toThrow();expect(()=>store.clear()).not.toThrow();}expect(log).not.toHaveBeenCalled();}finally{log.mockRestore();}
});
