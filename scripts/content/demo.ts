import { z } from "zod";
import type { LlmClient, LlmRequest, LlmResult } from "../../src/contracts/llm";
import type { CharCard } from "../../src/contracts/schemas";

export const demoCards: CharCard[] = [
  { char: "休", pinyin: "xiū", radical: "亻", explain: "左边是单人旁，右边是木。休有歇一歇的意思，和体相比，右边的木下没有一横。", words: ["休息", "休假", "午休"], confusable: ["体"] },
  { char: "林", pinyin: "lín", radical: "木", explain: "林由两个木组成。它可以表示成片的树，森比林多一个木。", words: ["树林", "林地", "山林"], confusable: ["森"] },
  { char: "森", pinyin: "sēn", radical: "木", explain: "森里有三个木。它可以表示树很多，林只有两个木。", words: ["森林", "森严", "阴森"], confusable: ["林"] },
  { char: "采", pinyin: "cǎi", radical: "采", explain: "采的上面是爫，下面是木。采可以表示摘取，彩比采多了右边的彡。", words: ["采花", "采茶", "采摘"], confusable: ["彩"] },
  { char: "明", pinyin: "míng", radical: "日", explain: "明的左边是日，右边是月。明可以表示亮，朋的左右都是月。", words: ["明天", "明亮", "明白"], confusable: ["朋"] },
  { char: "早", pinyin: "zǎo", radical: "日", explain: "早的上面是日，下面是十。早可以表示时间靠前，草比早多了草字头。", words: ["早上", "早晨", "早饭"], confusable: ["草"] },
].map(card => ({ ...card, id: `card-${card.char}`, dictationContext: `${card.char}，${card.words[0]}的${card.char}`, source: "", audioUrl: null, status: "draft" }));

export const demoBody = [
  "早上，林间有一块小空地。小兔和小熊把圆圆的松果放在地上，想用它玩一场滚球游戏。小兔先画了两条线，又把几片大叶子放在线边。小熊说，叶子可以当球门。他们都没有玩过这样的游戏，便约好先试一试。",
  "第一回，小兔轻轻一推，松果还没有到叶子旁，就停在一块小石头前。小熊用力一推，松果却越过了线，滚进一堆落叶。他们没有急着再推，而是蹲下来，看松果走过的路。一边的地高一点，另一边有几个浅浅的小坑。",
  "小兔采来几片落叶，盖住了小坑。小熊搬开石头，再把两片当球门的叶子挪近一些。阳光穿过森林，地上的小路明亮起来。他们各试了一回，发现轻轻推也能让松果到达叶子旁。这回，松果没有滚进落叶堆。",
  "玩了一会儿，他们坐在树下休息。风吹过来，两片叶子忽然翻了个身。小兔望着新的球门笑了，小熊也把松果拿到手里。下一回，他们会把球门放在哪里呢？",
].join("");
export function createDemoClient(role: "draft" | "review"): LlmClient {
  return { async call<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
    const input = JSON.parse(request.user) as { char?: string; chars?: string[]; topic?: string };
    const value = role === "review" ? { issues: [] } : input.char ? demoCards.find(card => card.char === input.char) : {
      id: "demo-story", title: "叶子球门", body: demoBody, topic: input.topic, sourceType: "original", targetChars: input.chars,
      outOfScopeCount: 0, question: "你觉得他们为什么先看地上的路，再继续玩？", keyPoints: ["先找出松果停下和滚偏的原因", "一起调整地面和球门", "试过之后再看变化"], status: "draft",
    };
    const parsed = request.schema.safeParse(value);
    if (!parsed.success) return { ok: false, error: "invalid_output", model: "fake-demo", latencyMs: 0 };
    return { ok: true, data: parsed.data, model: "fake-demo", inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, latencyMs: 0 };
  } };
}
