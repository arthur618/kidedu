import { it, expect } from "vitest";
import { EssayRuntimeSchema } from "../../contracts/essay";
import { validCard, feedbackQuote, outputValid, safeEssayOutput, trustedEssayQuestion } from "./activity";
const activity=EssayRuntimeSchema.parse({topic:"编造主题",homeworkItemId:"synthetic",phase:"feedback",utterances:[],cards:[],history:[],essayText:"蓝伞落在小路边。",output:null,feedbackQuote:null,startedAt:"2026-11-14T02:00:00.000Z",completedAt:null});
const output={say:'我看见了：“蓝伞”',ask:"我还想知道，当时你听到了什么？",next:"wait_child" as const,newCard:null};
it("服务端逐字子串与非空白边界独立于Agent",()=>{
 expect(validCard("蓝 伞", "蓝 伞和风声")).toBe(true);for(const value of [null,"","  ","蓝伞","蓝 伞风声","上一轮原话"])expect(validCard(value,"蓝 伞和风声")).toBe(false);
});
it.each(["“蓝伞”",'蓝"伞',"蓝\n伞"," ","不存在", "蓝".repeat(41)])("反馈不能引用无来源/空白/嵌套或过长片段 %j",quote=>{
 expect(feedbackQuote({...output,say:`我看见了：“${quote}”`},activity.essayText!)).toBeNull();
});
it("反馈引用最多40契约字符，unicode和问题边界不能导致持久层500",()=>{
 expect(feedbackQuote(output,activity.essayText!)).toBe("蓝伞");expect(feedbackQuote({...output,say:output.say+"。"},activity.essayText!)).toBe("蓝伞");
 expect(feedbackQuote({...output,say:`我看见了：“${"😀".repeat(25)}”`},"😀".repeat(25))).toBeNull();
 for(const ask of [null,"", "我还想知道，后来怎样。", "我还想知道，你看到什么？你听到什么？", "我还想知道，你看到什么、听到什么？", '我还想知道，“山边”是什么？',"我还想知道，"+"蓝".repeat(61)+"？"]){expect(feedbackQuote({...output,ask},activity.essayText!)).toBeNull();}
});
it("可信fallback仍规则和来源复检；没有片段返回null，不假造评分/范文",()=>{
 for(const text of ["蓝伞落在小路边。", "“”\n。！？", "😀".repeat(40), "  小路  风声 "]){const next={...activity,essayText:text};const safe=safeEssayOutput(next,true);if(safe){expect(outputValid(safe,next,true)).toBe(true);expect(text.includes(feedbackQuote(safe,text)!)).toBe(true);}else expect(text).toBe("“”\n。！？");}
 expect(safeEssayOutput({...activity,essayText:null},true)).toBeNull();
});

it("F1 两阶段共用可验证问题模板，任意前后缀/新拟句/孩子原话都不能变成问题槽位",()=>{
 const pairs=[
  ["你看到了什么？","我还想知道，当时你看到了什么？"],
  ["你听到了什么？","我还想知道，当时你听到了什么？"],
  ["当时说了什么？","我还想知道，当时说了什么？"],
  ["当时你是怎么想的？","我还想知道，当时你是怎么想的？"],
  ["后来发生了什么？","我还想知道，后来发生了什么？"],
 ];
 for(const [interview,feedback] of pairs){
  for(const [ask,step] of [[interview,false],[feedback,true]] as const){
   expect(trustedEssayQuestion(ask!,step)).toBe(true);
   for(const altered of [ask+" "," "+ask,ask+"蓝天像画布。",ask!.replace("？","小河弯弯像丝带？"),ask!.replace("？","\n？")])expect(trustedEssayQuestion(altered,step)).toBe(false);
   expect(trustedEssayQuestion(ask!,!step)).toBe(false);
  }
 }
 const own="小河弯弯像丝带";const privateActivity={...activity,utterances:[own],essayText:own};
 for(const feedback of [false,true])expect(outputValid({...output,say:feedback?`我看见了：“${own}”`:"我听见了。",ask:(feedback?"我还想知道，":"")+`要不要把${own}记下来？`},privateActivity,feedback)).toBe(false);
 for(let count=0;count<=5;count++){const safe=safeEssayOutput({...activity,utterances:Array.from({length:count},()=>"编造原话")},false)!;expect(trustedEssayQuestion(safe.ask,false)).toBe(true);expect(outputValid(safe,activity,false)).toBe(true);}
 const safe=safeEssayOutput(activity,true)!;expect(trustedEssayQuestion(safe.ask,true)).toBe(true);expect(outputValid(safe,activity,true)).toBe(true);
});
