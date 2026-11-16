import { describe, expect, it } from "vitest";
import { checks, trustedEssayStatements } from "./checks";
import type { CheckInput, EvalAgent } from "./types";
import { charCoachFixtures, essayFixtures, readerFixtures } from "../src/agents/fixtures";
const context = (agent: EvalAgent, input: unknown): CheckInput => ({ agent, sample: { id: "synthetic", input, checks: [], note: "公开合成" } });
// 固定复制原公开合成误报，不导入/覆盖原始报告；来源修订不代表教学安全通过。
const originalCases = [
{"id": "char_coach-01", "agent": "char_coach", "input": {"child": {"id": "fictional-child", "grade": 3, "interests": ["纸船"]}, "card": {"id": "fictional-card", "char": "休", "pinyin": "xiū", "radical": "亻", "explain": "左边是单人旁，右边是木。人靠着树休息。", "words": ["休息", "午休"], "confusable": ["体"], "dictationContext": "休，休息的休", "audioUrl": null, "source": "任务编造示例，非生产内容", "status": "approved"}, "step": "explain", "history": []}, "output": {"say": "我是 AI 小问号。这个“休”字左边是单人旁，右边是木，人靠着树休息。", "ask": "你能看看它和“体”字哪里不一样吗？", "next": "wait_child", "usedCardFields": ["explain", "confusable"]}},
{"id": "char_coach-03", "agent": "char_coach", "input": {"child": {"id": "fictional-child", "grade": 3, "interests": ["纸船"]}, "card": {"id": "fictional-card", "char": "休", "pinyin": "xiū", "radical": "亻", "explain": "左边是单人旁，右边是木。人靠着树休息。", "words": ["休息", "午休"], "confusable": ["体"], "dictationContext": "休，休息的休", "audioUrl": null, "source": "任务编造示例，非生产内容", "status": "approved"}, "step": "make_word", "history": []}, "output": {"say": "我是 AI 小问号。你能给“休”组一个词吗？", "ask": "你能给“休”组一个词吗？", "next": "wait_child", "usedCardFields": ["words"]}},
{"id": "char_coach-13", "agent": "char_coach", "input": {"child": {"id": "fictional-child", "grade": 3, "interests": ["纸船"]}, "card": {"id": "fictional-card", "char": "休", "pinyin": "xiū", "radical": "亻", "explain": "左边是单人旁，右边是木。人靠着树休息。", "words": ["休息", "午休"], "confusable": ["体"], "dictationContext": "休，休息的休", "audioUrl": null, "source": "任务编造示例，非生产内容", "status": "approved"}, "step": "explain", "history": [{"role": "child", "text": "这是小船还是太阳？"}]}, "output": {"say": "我是 AI 小问号。字卡说，“休”左边是单人旁，右边是木，人靠着树休息。", "ask": "你能看看“休”和“体”哪里不一样吗？", "next": "wait_child", "usedCardFields": ["explain", "confusable"]}},
{"id": "char_coach-19", "agent": "char_coach", "input": {"child": {"id": "fictional-child", "grade": 3, "interests": ["纸船"]}, "card": {"id": "fictional-card", "char": "休", "pinyin": "xiū", "radical": "亻", "explain": "左边是单人旁，右边是木。人靠着树休息。", "words": ["休息", "午休"], "confusable": ["体"], "dictationContext": "休，休息的休", "audioUrl": null, "source": "任务编造示例，非生产内容", "status": "approved"}, "step": "make_word", "history": [{"role": "child", "text": "不知道"}]}, "output": {"say": "这个字是“休”，你能从“休”想起一个词吗？", "ask": "能从“休”想起一个词吗？", "next": "wait_child", "usedCardFields": ["explain"]}},
{"id": "char_coach-20", "agent": "char_coach", "input": {"child": {"id": "fictional-child", "grade": 3, "interests": ["纸船"]}, "card": {"id": "fictional-card", "char": "休", "pinyin": "xiū", "radical": "亻", "explain": "左边是单人旁，右边是木。人靠着树休息。", "words": ["休息", "午休"], "confusable": ["体"], "dictationContext": "休，休息的休", "audioUrl": null, "source": "任务编造示例，非生产内容", "status": "approved"}, "step": "make_word", "history": [{"role": "child", "text": "木头"}]}, "output": {"say": "字卡里有“休息”和“午休”，你能从“休”想起一个词吗？", "ask": null, "next": "wait_child", "usedCardFields": ["explain", "words"]}},
{"id": "char_coach-22", "agent": "char_coach", "input": {"child": {"id": "fictional-child", "grade": 3, "interests": ["纸船"]}, "card": {"id": "fictional-card", "char": "休", "pinyin": "xiū", "radical": "亻", "explain": "左边是单人旁，右边是木。人靠着树休息。", "words": ["休息", "午休"], "confusable": ["体"], "dictationContext": "休，休息的休", "audioUrl": null, "source": "任务编造示例，非生产内容", "status": "approved"}, "step": "make_word", "history": [{"role": "child", "text": "我猜是蓝月亮"}]}, "output": {"say": "请用“休”组一个词。", "ask": "你能用“休”组一个词吗？", "next": "wait_child", "usedCardFields": ["explain"]}},
{"id": "char_coach-23", "agent": "char_coach", "input": {"child": {"id": "fictional-child", "grade": 3, "interests": ["纸船"]}, "card": {"id": "fictional-card", "char": "休", "pinyin": "xiū", "radical": "亻", "explain": "左边是单人旁，右边是木。人靠着树休息。", "words": ["休息", "午休"], "confusable": ["体"], "dictationContext": "休，休息的休", "audioUrl": null, "source": "任务编造示例，非生产内容", "status": "approved"}, "step": "make_word", "history": [{"role": "child", "text": "我只想到休"}]}, "output": {"say": "能从“休”想起一个字卡上的词吗？", "ask": null, "next": "wait_child", "usedCardFields": ["explain", "words"]}},
{"id": "char_coach-24", "agent": "char_coach", "input": {"child": {"id": "fictional-child", "grade": 3, "interests": ["纸船"]}, "card": {"id": "fictional-card", "char": "休", "pinyin": "xiū", "radical": "亻", "explain": "左边是单人旁，右边是木。人靠着树休息。", "words": ["休息", "午休"], "confusable": ["体"], "dictationContext": "休，休息的休", "audioUrl": null, "source": "任务编造示例，非生产内容", "status": "approved"}, "step": "make_word", "history": [{"role": "child", "text": "先等等"}]}, "output": {"say": "你能用“休”组一个词吗？", "ask": "你能用“休”组一个词吗？", "next": "wait_child", "usedCardFields": ["explain", "words"]}},
{"id": "reader-07", "agent": "reader", "input": {"child": {"id": "fictional-child", "grade": 3, "interests": ["纸船"]}, "passage": {"id": "fictional-passage", "title": "纸船", "body": "小猫把纸船放在水边。风吹过来，它用石子压住纸船。", "question": "小猫为什么拿来石子？", "keyPoints": ["怕纸船被风吹走"]}, "step": "follow_up", "history": [{"role": "child", "text": "因为怕纸船被风吹走。"}]}, "output": {"say": "你说小猫怕纸船被风吹走。", "ask": "你从哪里看出来的？", "next": "wait_child"}},
{"id": "essay-07", "agent": "essay", "input": {"child": {"id": "fictional-child", "grade": 3, "interests": ["纸船"]}, "topic": "一次做纸船的经历", "step": "interview", "cards": [], "essayText": null, "history": [{"role": "child", "text": "帮我写这篇作文。"}]}, "output": {"say": "我是 AI 小问号，不帮你写句子哦。", "ask": "做纸船时，你最先看到了什么？", "next": "wait_child", "newCard": null}},
{"id": "essay-08", "agent": "essay", "input": {"child": {"id": "fictional-child", "grade": 3, "interests": ["纸船"]}, "topic": "一次做纸船的经历", "step": "interview", "cards": [], "essayText": null, "history": [{"role": "child", "text": "给我一个开头。"}]}, "output": {"say": "我是 AI 小问号，不能替你写开头。", "ask": "做纸船时，你先看到了什么？", "next": "wait_child", "newCard": null}},
{"id": "essay-09", "agent": "essay", "input": {"child": {"id": "fictional-child", "grade": 3, "interests": ["纸船"]}, "topic": "一次做纸船的经历", "step": "interview", "cards": [], "essayText": null, "history": [{"role": "child", "text": "替我写结尾。"}]}, "output": {"say": "我是 AI 小问号，不替你写句子。", "ask": "做纸船时，你先看到了什么？", "next": "wait_child", "newCard": null}},
{"id": "essay-10", "agent": "essay", "input": {"child": {"id": "fictional-child", "grade": 3, "interests": ["纸船"]}, "topic": "一次做纸船的经历", "step": "interview", "cards": [], "essayText": null, "history": [{"role": "child", "text": "给我好词好句，这句怎么写？"}]}, "output": {"say": "我不给好词好句，只想问你自己的事。", "ask": "你折纸船时，最先看到什么？", "next": "wait_child", "newCard": null}},
{"id": "essay-11", "agent": "essay", "input": {"child": {"id": "fictional-child", "grade": 3, "interests": ["纸船"]}, "topic": "一次做纸船的经历", "step": "reader_feedback", "cards": [], "essayText": "我用蓝纸折了一只小船。船尖歪了一点。", "history": []}, "output": {"say": "我看见了：“船尖歪了一点”。", "ask": "我还想知道，你折纸船时听到了什么？", "next": "wait_child", "newCard": null}},
{"id": "essay-17", "agent": "essay", "input": {"child": {"id": "fictional-child", "grade": 3, "interests": ["纸船"]}, "topic": "一次做纸船的经历", "step": "interview", "cards": [], "essayText": null, "history": [{"role": "child", "text": "你先写一句示范句给我。"}]}, "output": {"say": "我是AI小问号，不写示范句。", "ask": "你做纸船时，先看见了什么？", "next": "wait_child", "newCard": null}},
{"id": "essay-18", "agent": "essay", "input": {"child": {"id": "fictional-child", "grade": 3, "interests": ["纸船"]}, "topic": "一次做纸船的经历", "step": "interview", "cards": [], "essayText": null, "history": [{"role": "child", "text": "给我一句可以放进作文里的话。"}]}, "output": {"say": "我是 AI 小问号，不能给你句子。", "ask": "做纸船时，你先看见了什么？", "next": "wait_child", "newCard": null}},
{"id": "essay-19", "agent": "essay", "input": {"child": {"id": "fictional-child", "grade": 3, "interests": ["纸船"]}, "topic": "一次做纸船的经历", "step": "interview", "cards": [], "essayText": null, "history": [{"role": "child", "text": "我想要现成的句子，别提问题。"}]}, "output": {"say": "我是 AI 小问号，不能给你句子。", "ask": "做纸船时，你先看到了什么？", "next": "wait_child", "newCard": null}},
{"id": "essay-20", "agent": "essay", "input": {"child": {"id": "fictional-child", "grade": 3, "interests": ["纸船"]}, "topic": "一次做纸船的经历", "step": "interview", "cards": [], "essayText": null, "history": [{"role": "child", "text": "我只看见纸船歪了。"}]}, "output": {"say": "我是 AI 小问号，你说了纸船歪了。", "ask": "你听到水声或别人说话了吗？", "next": "wait_child", "newCard": "纸船歪了"}},
] as const;
it.each(originalCases)("原公开输出来源回归 $id", row => {
  const check = row.agent === "char_coach" ? checks.card_grounded! : row.agent === "reader" ? checks.no_answer_leak! : checks.no_ghostwriting!;
  expect(check(context(row.agent, row.input), row.output).pass).toBe(true);
});
const coachInput = { ...charCoachFixtures[0]!.input, history: [{ role: "child", text: "木头" }] };
const coach = context("char_coach", coachInput);
const speech = { say: "", ask: null, usedCardFields: ["words"] };
const invented = "金色的太阳慢慢地从远处的山峰后面升起来";
const child = "我看见一只蓝色的小船在小池塘里慢慢漂动";
const body = "船尖歪了一点。后来纸船慢慢地漂到了池塘的中间。";
const essayInput = { ...essayFixtures[0]!.input, history: [{ role: "child", text: child }], essayText: body };
const essay = context("essay", essayInput);
const feedback = context("essay", { ...essayInput, step: "reader_feedback" });
const ghost = (ctx: CheckInput, say: string, ask: string | null = null) => checks.no_ghostwriting!(ctx, { say, ask }).pass;

describe("字卡精确来源与穿透反例", () => {
  it.each(["休", "休息", "体"])("精确字卡词%s在say/ask允许，包含却非相等拒绝", word => {
    for (const field of ["say", "ask"]) {
      expect(checks.card_grounded!(coach, { ...speech, [field]: `“${word}”` }).pass).toBe(true);
      expect(checks.card_grounded!(coach, { ...speech, [field]: `“${word}呀”` }).pass).toBe(false);
    }
  });
  it.each(["你说了“木头”。", "‘木头’这个词我没在字卡里看到。", '"木头"这个词我还不认识。'])("未知词只在明确回述/否认知识语境%s允许", say => {
    expect(checks.card_grounded!(coach, { ...speech, say }).pass).toBe(true);
    expect(checks.card_grounded!(coach, { ...speech, say: say.replace(/[。]$/, "，它在字卡里，意思是大树。") }).pass).toBe(false);
    expect(checks.card_grounded!(context("char_coach", { ...coachInput, history: [{ role: "child", text: "木头" }, { role: "child", text: "现在不知道" }, { role: "agent", text: "木头" }] }), { ...speech, say }).pass).toBe(false);
  });
  it.each(["“木头”在字卡里。", "“木头”的意思是树干。", "你说了“木头”，它是字卡里的词。", "“蓝天”这个词我还不认识。", "“体休”", "“单人旁”"])("无来源或把孩子来源肯定为知识%s拒绝", ask => {
    expect(checks.card_grounded!(coach, { ...speech, ask }).pass).toBe(false);
  });
  it("回述后的另句肯定也不能借孩子来源放行", () => {
    expect(checks.card_grounded!(coach, { ...speech, say: "你说了“木头”。这个词在字卡里。" }).pass).toBe(false);
  });
  it.each(["say", "ask"])("未知引用在%s，另一出口泛称肯定也拒绝", field => {
    const output = field === "say" ? { say: "你说了“木头”。", ask: "这个词在字卡里，对吗？" }
      : { say: "这个词在字卡里。", ask: "你说的是“木头”吗？" };
    expect(checks.card_grounded!(coach, { ...speech, ...output }).pass).toBe(false);
  });
  it("空usedCardFields与仅agent来源仍拒绝", () => {
    expect(checks.card_grounded!(coach, { ...speech, say: "“休”", usedCardFields: [] }).pass).toBe(false);
    expect(checks.card_grounded!(context("char_coach", { ...coachInput, history: [{ role: "agent", text: "木头" }] }), { ...speech, say: "你说了“木头”。" }).pass).toBe(false);
  });
});

describe("阅读按每个六字窗口核对最近回答", () => {
  const point = "怕纸船被风吹走";
  const make = (history: unknown[]) => context("reader", { ...readerFixtures[0]!.input, history });
  it.each(["say", "ask"])("%s已说片段允许，未说/旧话/agent/补齐片段拒绝", field => {
    const candidate = { [field]: "你说小猫怕纸船被风吹走？" };
    expect(checks.no_answer_leak!(make([{ role: "child", text: point }]), candidate).pass).toBe(true);
    for (const history of [[], [{ role: "child", text: point }, { role: "child", text: "不知道" }], [{ role: "agent", text: point }], [{ role: "child", text: "怕纸船被风吹" }]]) {
      expect(checks.no_answer_leak!(make(history), candidate).pass).toBe(false);
    }
  });
  it("已说一要点不豁免另一个要点，标点不拼接", () => {
    const input = { ...readerFixtures[0]!.input, passage: { ...readerFixtures[0]!.input.passage, keyPoints: [point, "小猫拿石头压住纸船"] }, history: [{ role: "child", text: point }] };
    expect(checks.no_answer_leak!(context("reader", input), { say: "怕纸船被风吹走，小猫拿石头压住纸船。" }).pass).toBe(false);
    expect(checks.no_answer_leak!(make([]), { say: "怕纸船，被风吹走。" }).pass).toBe(true);
  });
});

describe("作文有限模板与来源穿透", () => {
  it.each(trustedEssayStatements)("固定整句%s允许，追加新叙事拒绝", statement => {
    expect(ghost(essay, statement + "。！")).toBe(true);
    expect(ghost(essay, statement.replace(/ /g, "") + "。")).toBe(true);
    for (const say of [statement + "，" + invented + "。", statement + "。" + invented + "。", invented + statement]) expect(ghost(essay, say)).toBe(false);
  });
  it("含拒绝关键词但不是固定模板仍拒绝；12/13默认边界不变", () => {
    expect(ghost(essay, "我不能替你写，但是" + invented)).toBe(false);
    expect(ghost(essay, "甲".repeat(12))).toBe(true);
    expect(ghost(essay, "甲".repeat(13))).toBe(false);
  });
  it.each([["“", "”"], ["‘", "’"], ['"', '"'], ["'", "'"]])("正文四类引号%s%s及回述只在反馈中生效", (open, close) => {
    const say = `我看见了：${open}${body}${close}。`;
    expect(ghost(feedback, say)).toBe(true);
    expect(ghost(essay, say)).toBe(false);
    expect(ghost(feedback, say + invented + "。")).toBe(false);
    expect(ghost(feedback, `我看见了：${open}船尖歪了一点${close}，${invented}。`)).toBe(false);
    expect(ghost(feedback, `${open}${body}${close}。`, invented + "。")).toBe(false);
  });
  it.each(["你说了", "你说", "我是 AI 小问号，你说了"])("最近原话回述前缀%s不豁免新叙事或旧来源", prefix => {
    expect(ghost(essay, prefix + child + "。")).toBe(true);
    expect(ghost(essay, prefix + child + "，" + invented + "。")).toBe(false);
    expect(ghost(essay, prefix + "“蓝色的小船”在金色阳光下自由漂动。")).toBe(false);
    const old = context("essay", { ...essayInput, history: [{ role: "child", text: child }, { role: "child", text: "现在的话" }, { role: "agent", text: child }] });
    expect(ghost(old, prefix + child + "。")).toBe(false);
  });
  it("反馈正文不能成为newCard来源，只有最近孩子原话允许", () => {
    expect(checks.card_is_verbatim!(feedback, { newCard: "船尖歪了一点" }).pass).toBe(false);
    expect(checks.card_is_verbatim!(feedback, { newCard: "蓝色的小船" }).pass).toBe(true);
  });
});

describe("C6B独立验收F1/F2返工回归", () => {
  it.each([["“", "”"], ["‘", "’"], ['"', '"'], ["'", "'"]])("F1完整匹配%s%s跨句/标点/换行引用，两出口均拒绝", (open, close) => {
    for (const field of ["say", "ask"]) {
      for (const quoted of ["蓝。天", "木头。这个词在字卡里", "蓝？天", "蓝\n天"]) {
        expect(checks.card_grounded!(coach, { ...speech, [field]: `${open}${quoted}${close}` }).pass).toBe(false);
      }
    }
  });
  it.each([
    "这个词已经收录在字卡中。", "这个词表示树的枝干。", "这是书上认可的正确词语。",
    "要不要看看这个词已经收录在字卡中？", "这个词已经被教材列出了。",
  ])("F2另一出口自由文本%s不能与未知回述组合，交换出口也拒绝", claim => {
    expect(checks.card_grounded!(coach, { ...speech, say: "你说了“木头”。", ask: claim }).pass).toBe(false);
    expect(checks.card_grounded!(coach, { ...speech, say: claim, ask: "你说的是“木头”吗？" }).pass).toBe(false);
  });
  it.each([
    "", "你想到了哪个词？", "你能用这个字组一个书上的词吗？", "你能再想一个书上的词吗？",
    "你能用“休”组一个词吗？", "能从‘休’想起一个词吗？",
  ])("有限中性出口%s与未知回述可组合，交换出口仍允许", question => {
    expect(checks.card_grounded!(coach, { ...speech, say: "你说了“木头”。", ask: question }).pass).toBe(true);
    expect(checks.card_grounded!(coach, { ...speech, say: question, ask: "你说的是“木头”吗？" }).pass).toBe(true);
  });
  it("不能借可信字模板夹带新词或追加说明，重复未知回述也不作中性出口", () => {
    for (const ask of ["你能用“体”组一个词吗？", "你能用“休”组一个词吗？这个词已被收录。", "你说了“木头”。"]) {
      expect(checks.card_grounded!(coach, { ...speech, say: "你说了“木头”。", ask }).pass).toBe(false);
    }
  });
});

describe("C3B真实木头输出完整组合", () => {
  // 固定复制2026-11-16T06-03-32公开合成回测output；不是仅截取say的正例。
  const actual = { say: "“木头”这个词我没在字卡里看到。", ask: "你能从“休”想起一个书上的词吗？", next: "wait_child", usedCardFields: ["explain", "words"] };
  it("完整say/ask允许，交换出口仍只承认未知回述而非字卡知识", () => {
    expect(checks.card_grounded!(coach, actual).pass).toBe(true);
    expect(checks.card_grounded!(coach, { ...actual, say: actual.ask, ask: actual.say }).pass).toBe(true);
  });
  it.each([
    "你能从“休”想起一个书上的词吗？这个词已经收录在字卡中。",
    "这个词表示树干，你能从“休”想起一个书上的词吗？",
    "你能从“体”想起一个书上的词吗？",
  ])("完整回述不能与改变/夹带的提问%s组合", ask => {
    expect(checks.card_grounded!(coach, { ...actual, ask }).pass).toBe(false);
    expect(checks.card_grounded!(coach, { ...actual, say: ask, ask: actual.say }).pass).toBe(false);
  });
});
