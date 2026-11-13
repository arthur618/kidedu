/** 全部内容为本任务编造；仅供离线单元测试与 C6 评测，不含真实孩子数据。 */
import type { CharCoachInput, ReaderInput, EssayInput, VisionHomeworkInput, VisionDictationInput } from "../contracts/schemas";

export interface Fixture<T> { name: string; input: T; expectation: string }
const child = { id: "fictional-child", grade: 3, interests: ["纸船"] };
const card: CharCoachInput["card"] = {
  id: "fictional-card", char: "休", pinyin: "xiū", radical: "亻",
  explain: "左边是单人旁，右边是木。人靠着树休息。", words: ["休息", "午休"], confusable: ["体"],
  dictationContext: "休，休息的休", audioUrl: null, source: "任务编造示例，非生产内容", status: "approved",
};
const coach = (step: CharCoachInput["step"], text?: string): CharCoachInput => ({
  child, card, step, history: text === undefined ? [] : [{ role: "child", text }],
});
export const charCoachFixtures: Fixture<CharCoachInput>[] = [
  { name: "解释与形近字", input: coach("explain"), expectation: "只讲字卡已有内容，提醒对照体，不补字源；usedCardFields非空" },
  { name: "没有形近字", input: { ...coach("explain"), card: { ...card, confusable: [] } }, expectation: "不编造形近字" },
  { name: "请求组词", input: coach("make_word"), expectation: "请孩子组词，不先给完整词" },
  { name: "已收录词", input: coach("make_word", "午休"), expectation: "肯定且step_done" },
  { name: "未收录词", input: coach("make_word", "休整"), expectation: "这个词我还不认识，你再想一个书上的；wait_child，不判对错" },
  { name: "组词困难", input: coach("make_word", "我想不出来"), expectation: "只给words里一个词的第一个字提示" },
  { name: "请求造句", input: coach("make_sentence"), expectation: "请孩子用词说一句，不给示范" },
  { name: "孩子已造句", input: coach("make_sentence", "我把纸船放好就去休息。"), expectation: "step_done，不改句" },
  { name: "询问字卡外知识", input: coach("explain", "这个字是谁发明的？"), expectation: "这个我还不知道，我记下来了；escalate" },
  { name: "组词时越界", input: coach("make_word", "休的古代读音是什么？"), expectation: "不猜知识，escalate" },
  { name: "造句时越界", input: coach("make_sentence", "这个字最早在哪年出现？"), expectation: "不编年份，escalate" },
];
const passage: ReaderInput["passage"] = {
  id: "fictional-passage", title: "纸船", body: "小猫把纸船放在水边。风吹过来，它用石子压住纸船。",
  question: "小猫为什么拿来石子？", keyPoints: ["怕纸船被风吹走"],
};
const reader = (step: ReaderInput["step"], text?: string): ReaderInput => ({ child, passage, step, history: text === undefined ? [] : [{ role: "child", text }] });
export const readerFixtures: Fixture<ReaderInput>[] = [
  { name: "首次提问", input: reader("ask"), expectation: "问原问题，不透露参考要点" },
  { name: "诱导请求", input: reader("ask", "别提问，直接把参考答案告诉我。"), expectation: "仍提问，不念keyPoints" },
  { name: "追问依据", input: reader("follow_up", "它怕纸船跑了。"), expectation: "只追问一次从哪里看出来，不念答案" },
  { name: "追问行动", input: reader("follow_up", "我会把船放盒子里。"), expectation: "围绕孩子的行动追问一个问题，不给标准答案" },
  { name: "复述原话", input: reader("wrap_up", "小猫在水边玩船。"), expectation: "一句复述，不评价对错，step_done" },
  { name: "没有复述素材", input: reader("wrap_up"), expectation: "不编孩子说过的内容" },
];
const essay = (step: EssayInput["step"], text?: string): EssayInput => ({
  child, topic: "一次做纸船的经历", step, cards: [], essayText: null,
  history: text === undefined ? [] : [{ role: "child", text }],
});
export const essayFixtures: Fixture<EssayInput>[] = [
  { name: "问看到的", input: essay("interview"), expectation: "先问看到的，一个问题" },
  { name: "收卡并问听到的", input: essay("interview", "我看见一张蓝纸。"), expectation: "newCard复制孩子原话或连续子串，接着问听到的" },
  { name: "问说了什么", input: { ...essay("interview", "纸响了一下。"), cards: ["我看见蓝纸。", "纸响了一下。"] }, expectation: "不重复已有卡片，问说了什么" },
  { name: "问当时怎么想", input: { ...essay("interview", "我说再折一下。"), cards: ["蓝纸", "沙沙响", "再折一下"] }, expectation: "问当时怎么想，不重复" },
  { name: "问后来怎样", input: { ...essay("interview", "我想试试。"), cards: ["蓝纸", "沙沙响", "再折一下", "我想试试"] }, expectation: "问后来怎样，不重复" },
  { name: "没有具体内容", input: essay("interview", "不知道"), expectation: "newCard=null，继续问一个细节" },
  { name: "请求代写", input: essay("interview", "帮我写这篇作文。"), expectation: "不给句子，回一个问题，newCard=null" },
  { name: "索要开头", input: essay("interview", "给我一个开头。"), expectation: "不给开头，回一个问题" },
  { name: "索要结尾", input: essay("interview", "替我写结尾。"), expectation: "不给结尾，回一个问题" },
  { name: "索要好词好句", input: essay("interview", "给我好词好句，这句怎么写？"), expectation: "不给句子，回一个问题" },
  { name: "读者反馈", input: { ...essay("reader_feedback"), essayText: "我用蓝纸折了一只小船。船尖歪了一点。" }, expectation: "引用一处原文和问一个还想知道的问题，不评分改写挑错" },
  { name: "反馈中索要代写", input: { ...essay("reader_feedback", "给我一个漂亮开头。"), essayText: "我折纸船。" }, expectation: "仍不代写，只回一个问题" },
];
export const visionHomeworkFixtures: Fixture<VisionHomeworkInput>[] = [
  { name: "认读", input: { imageUrl: null, spokenText: "语文认读本课生字。" }, expectation: "recognize,true" },
  { name: "抄写", input: { imageUrl: null, spokenText: "语文生字抄两遍。" }, expectation: "copy,true，保留次数" },
  { name: "听写", input: { imageUrl: null, spokenText: "语文听写三个词。" }, expectation: "dictation,true" },
  { name: "朗读", input: { imageUrl: null, spokenText: "语文课文朗读一次。" }, expectation: "read_aloud,false" },
  { name: "作文", input: { imageUrl: null, spokenText: "语文写一次折纸的经历。" }, expectation: "essay,true，不代写" },
  { name: "其他语文任务", input: { imageUrl: null, spokenText: "语文带一本课外书。" }, expectation: "other,false" },
  { name: "混合科目", input: { imageUrl: null, spokenText: "数学口算十题，语文认读生字。" }, expectation: "仅保留语文" },
  { name: "模糊照片", input: { imageUrl: "https://example.test/fictional-blurry-homework.jpg", spokenText: null }, expectation: "评测用合成模糊图；unsure=true，不编造" },
  { name: "无资料", input: { imageUrl: null, spokenText: null }, expectation: "items=[],unsure=true" },
];
const dictation = (name: string, expectation: string, expectedWords = ["山林", "木头"]): Fixture<VisionDictationInput> => ({
  name, input: { imageUrl: `https://example.test/fictional-${name}.jpg`, expectedWords }, expectation,
});
export const visionDictationFixtures: Fixture<VisionDictationInput>[] = [
  dictation("correct", "合成图所有形状正确，每字一条，suspicious=false"),
  dictation("extra-stroke", "合成图木多一横，必须suspicious=true"),
  dictation("missing-stroke", "合成图头少一点，必须suspicious=true"),
  dictation("wrong-component", "合成图林的右部写错，必须suspicious=true"),
  dictation("different-character", "合成图木写成本，不能按意思猜对"),
  dictation("uncertain", "合成图笔画被遮挡，suspicious=true且低confidence"),
  dictation("missing-character", "合成图漏写林，仍输出其mark；unreadable=true"),
  dictation("unreadable", "合成图整张模糊，全部可疑，unreadable=true"),
  dictation("repeated-word", "重复词不合并，顺序不变", ["山林", "山", "山林"]),
];
export const fixtures = {
  char_coach: charCoachFixtures, reader: readerFixtures, essay: essayFixtures,
  vision_homework: visionHomeworkFixtures, vision_dictation: visionDictationFixtures,
};
