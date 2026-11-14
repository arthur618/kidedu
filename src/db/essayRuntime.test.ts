import { beforeAll, afterAll, it, expect } from "vitest";
import { database } from "../../tests/integration/helpers";
import { getEssayRuntime, saveEssayRuntime, getEssayCommand, saveEssayCommand } from "./essayRuntime";
import { getPrisma, withTransaction } from "./client";
import type { EssayRuntime } from "../contracts/essay";
let db: Awaited<ReturnType<typeof database>>;
beforeAll(async()=>{db=await database();});afterAll(async()=>{await db.cleanup();});
const activity: EssayRuntime={topic:"编造散步",homeworkItemId:"synthetic-homework",phase:"interview",utterances:["一把蓝 伞"],cards:[{id:"stable-one",text:"蓝 伞",sourceUtterance:0,selected:true}],history:[{role:"child",text:"一把蓝 伞"}],essayText:null,output:null,feedbackQuote:null,startedAt:"2026-11-14T02:00:00.000Z",completedAt:null};
it("契约严格往返；prepared正文仅在私有活动表，完成清理恢复载荷不丢活动",async()=>{
 expect(await getEssayRuntime("missing")).toBeNull();expect(await getEssayCommand("missing","key")).toBeNull();
 await saveEssayCommand("essay-fixture","stable-key",{type:"submit_essay",text:"编造正文只在私有表"});expect(await getEssayRuntime("essay-fixture")).toBeNull();
 await saveEssayRuntime("essay-fixture",activity);expect(await getEssayRuntime("essay-fixture")).toEqual(activity);expect(await getEssayCommand("essay-fixture","stable-key")).toEqual({type:"submit_essay",text:"编造正文只在私有表"});
 await saveEssayCommand("essay-fixture","stable-key",null);expect(await getEssayCommand("essay-fixture","stable-key")).toBeNull();expect(await getEssayRuntime("essay-fixture")).toEqual(activity);
 await expect(saveEssayRuntime("essay-fixture",{...activity,privateExtra:true} as EssayRuntime)).rejects.toThrow();expect(await getPrisma().sessionCommand.count()).toBe(0);
});
it("短事务内活动和私有恢复载荷出错全部回滚",async()=>{
 await saveEssayRuntime("rollback",activity);
 await expect(withTransaction(async()=>{await saveEssayRuntime("rollback",{...activity,phase:"cards"});await saveEssayCommand("rollback","pending",{type:"answer",text:"未提交原话"});throw new Error("synthetic");})).rejects.toThrow("synthetic");
 expect(await getEssayRuntime("rollback")).toEqual(activity);expect(await getEssayCommand("rollback","pending")).toBeNull();
});
