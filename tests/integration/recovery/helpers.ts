import { Prisma } from '@prisma/client';
import { getPrisma } from '../../../src/db/client';
import { harness } from '../helpers';
import { createHttpService } from '../../../src/ui/service';
import type { RecoveryStorage } from '../../../src/ui/recovery/store';
export function memoryStorage() { const values=new Map<string,string>(); const storage:RecoveryStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);},removeItem:k=>{values.delete(k);}}; return {storage,values}; }
export const recoveryRequest=(body:unknown)=>new Request('http://localhost/api/session/resume',{method:'POST',body:JSON.stringify(body)});
export const binding={childId:'child-test-1',lessonId:'c7-lesson'};
export function resume(h:ReturnType<typeof harness>,sessionId:string,operationId?:string,extra:Record<string,unknown>={}) {return h.handlers().resume(sessionId,recoveryRequest({...binding,...(operationId?{operationId}:{}),...extra}));}
export async function snapshot() {return Promise.all(Prisma.dmmf.datamodel.models.map(model=>(getPrisma() as unknown as Record<string,{findMany():Promise<unknown[]>}>)[model.name[0]!.toLowerCase()+model.name.slice(1)]!.findMany()));}
export function connect(h:ReturnType<typeof harness>) {
 const memory=memoryStorage();const requests:{url:string;key:string|null;body:unknown}[]=[];let lose=false;let skip=false;
 const fetcher:typeof fetch=async(url,init)=>{const path=String(url);const request=new Request('http://localhost'+path,init);const body=await request.clone().json();requests.push({url:path,key:request.headers.get('Idempotency-Key'),body});if(skip){skip=false;throw new Error('lost_before_delivery');}const parts=path.split('/').filter(Boolean);const response=parts[3]==='resume'?await h.handlers().resume(parts[2]!,request):await h.handlers().post(parts.length===2?'start':parts[3] as 'event'|'essay'|'reading'|'homework'|'coach',request,parts[2]);if(lose){lose=false;throw new Error('response_lost');}return response;};
 return {memory,requests,lose(){lose=true;},skip(){skip=true;},client:()=>createHttpService({...binding,storage:()=>memory.storage,fetcher})};
}
