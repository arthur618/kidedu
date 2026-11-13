import { describe, expect, it } from "vitest";
import { checkDocument, countScope, fingerprint, han, type Document } from "./checks";
import { demoBody, demoCards } from "./demo";

const card = () => ({ ...demoCards[0]! });
const story = (): Document => ({ id: "story", title: "叶子球门", body: demoBody, topic: "游戏", sourceType: "original", targetChars: ["休", "森", "采"], outOfScopeCount: 0, question: "你觉得为什么先看地上的路？", keyPoints: ["原因", "调整", "变化"], status: "draft", _knownChars: [...new Set(han(demoBody))] });
describe("逐条代码检查规则", () => {
  it("对应的三个契约schema均检查结构：通过和不通过", () => {
    for (const [kind, good, bad] of [
      ["cards", card(), { ...card(), words: [] }],
      ["passages", story(), { ...story(), sourceType: "copied" }],
      ["lessons", { id: "demo", grade: 3, term: "upper", lessonNo: 1, title: "虚构", recognizeChars: ["休"], writeChars: [], words: [], status: "draft" }, { id: 1 }],
    ] as const) {
      expect(checkDocument(kind, good).issues).toEqual([]);
      expect(checkDocument(kind, bad).issues.length).toBeGreaterThan(0);
    }
  });
  it.each([
    ["单个汉字", { char: "A" }, "char"],
    ["声调符号", { pinyin: "xiu1" }, "声调"],
    ["词语含字", { words: ["休息", "休假", "午睡"] }, "每个词语"],
    ["三到五词", { words: ["休息"] }, "三到五"],
    ["形近字不含自己", { confusable: ["休"] }, "自己"],
    ["形近字数量和汉字", { confusable: ["a"] }, "零到三个"],
    ["语境含字和词", { dictationContext: "体，身体的体" }, "包含目标字"],
    ["语境格式", { dictationContext: "休息（休）" }, "格式"],
    ["两三句讲解", { explain: "一个句子。" }, "两三句"],
    ["部首非空", { radical: " " }, "部首"],
    ["不合成音频", { audioUrl: "https://example.test/a.mp3" }, "audioUrl"],
  ])("字卡%s：通过和不通过", (_name, patch, issue) => {
    expect(checkDocument("cards", card()).issues).toEqual([]);
    expect(checkDocument("cards", { ...card(), ...patch }).issues.join("；")).toContain(issue);
  });
  it.each([
    ["字数下界", { body: "休森采" }, "300至500"],
    ["字数上界", { body: "休森采".repeat(200) }, "300至500"],
    ["目标字覆盖", { targetChars: ["龟"] }, "目标汉字"],
    ["known快照", { _knownChars: undefined }, "known-chars"],
    ["超纲比例", { _knownChars: ["休"] }, "超过3%"],
    ["推理问题", { question: "谁拿着松果？" }, "为什么"],
    ["三个要点", { keyPoints: ["原因"] }, "三个"],
  ])("短文%s：通过和不通过", (_name, patch, issue) => {
    expect(checkDocument("passages", story()).issues).toEqual([]);
    expect(checkDocument("passages", { ...story(), ...patch }).issues.join("；")).toContain(issue);
  });
  it("统计只算不同汉字，重复汉字只计一次，标点数字字母不计", () => {
    expect(countScope("休休，森林采！123ABC森。", ["休", "林"])).toEqual({ hanCount: 6, distinctCount: 4, outside: ["森", "采"], outOfScopeCount: 2, ratio: 0.5 });
    expect(countScope("123，abc！", [])).toEqual({ hanCount: 0, distinctCount: 0, outside: [], outOfScopeCount: 0, ratio: 0 });
  });
  it("超纲比例分母是不同汉字；3%边界通过，超过才失败，并写回计数", () => {
    const chars = Array.from({ length: 100 }, (_, i) => String.fromCodePoint(0x4e00 + i));
    const base = { ...story(), body: chars.join("").repeat(3), targetChars: [chars[0]!] };
    expect(checkDocument("passages", { ...base, _knownChars: chars.slice(3) }).issues).toEqual([]);
    const checked = checkDocument("passages", { ...base, _knownChars: chars.slice(4) });
    expect(checked.doc.outOfScopeCount).toBe(4);
    expect(checked.issues.join()).toContain("超过3%");
  });
  it("指纹不受键顺序/审批元数据影响，但绑定出处、正文、known快照和起草厂商", () => {
    expect(fingerprint({ a: 1, b: 2 })).toBe(fingerprint({ b: 2, a: 1, status: "reviewed", _check: {}, _review: {} }));
    for (const patch of [{ source: "改过" }, { explain: "改过" }, { _knownChars: ["字"] }, { _draft: { provider: "deepseek" } }]) expect(fingerprint({ ...card(), ...patch })).not.toBe(fingerprint(card()));
  });
});
