import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getCharCard, getCharCards } from "./charCard";
import { getChild } from "./child";
import { ContractDataError } from "./errors";
import { getPrisma } from "./client";
import { createTestDatabase, type TestDatabase } from "./test-db";
import { testCard, testChild } from "./test-fixtures";

let db: TestDatabase | undefined;

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("内容表只返回 approved", () => {
  it("draft 字卡 getCharCard 和 getCharCards 都读不到", async () => {
    await getPrisma().charCard.create({
      data: {
        id: "card-draft-1",
        char: "水",
        pinyin: "shuǐ",
        radical: "水",
        explain: "测试用的草稿字卡。",
        words: JSON.stringify(["河水"]),
        confusable: JSON.stringify(["永"]),
        dictationContext: "水，河水的水",
        audioUrl: null,
        source: "编造",
        status: "draft",
      },
    });

    await expect(getCharCard("水")).resolves.toBeNull();
    await expect(getCharCards(["水"])).resolves.toEqual([]);

    await getPrisma().charCard.create({
      data: {
        id: "card-approved-1",
        char: "山",
        pinyin: "shān",
        radical: "山",
        explain: "测试用的已审字卡。",
        words: JSON.stringify(["高山"]),
        confusable: JSON.stringify(["出"]),
        dictationContext: "山，高山的山",
        audioUrl: null,
        source: "编造",
        status: "approved",
      },
    });
    await expect(getCharCard("山")).resolves.toEqual({
      ...testCard,
      id: "card-approved-1",
      explain: "测试用的已审字卡。",
      words: ["高山"],
      source: "编造",
    });
  }, 20_000);
});

describe("坏数据要抛明确错误", () => {
  it("字卡字段不符合契约时抛 ContractDataError", async () => {
    await getPrisma().charCard.create({
      data: {
        id: "card-bad-1",
        char: "河",
        pinyin: "hé",
        radical: "水",
        explain: "测试用的坏数据。",
        words: "不是 JSON",
        confusable: JSON.stringify([]),
        dictationContext: "河，河水的河",
        audioUrl: null,
        source: "编造",
        status: "approved",
      },
    });

    const error = await getCharCard("河").catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ContractDataError);
    expect((error as ContractDataError).message).toContain("CharCard");
    expect((error as ContractDataError).message).toContain("card-bad-1");
  });

  it("孩子字段不符合契约时抛 ContractDataError，不返回坏数据", async () => {
    await getPrisma().child.create({
      data: {
        id: "child-bad-1",
        nickname: "小坏",
        grade: 3,
        interests: JSON.stringify("不是数组"),
        dailyLimitMinutes: 30,
      },
    });

    await expect(getChild("child-bad-1")).rejects.toBeInstanceOf(ContractDataError);
    await expect(getChild(testChild.id)).resolves.toBeNull();
  });
});
