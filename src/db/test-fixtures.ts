import type {
  CharCard,
  Child,
  ChildChar,
  HomeworkItem,
  Incident,
  Lesson,
  Passage,
  Session,
  Turn,
} from "../contracts/schemas";

/** 测试和种子示例都用编造的数据，不含任何真实孩子的信息。 */

export const testChild: Child = {
  id: "child-test-1",
  nickname: "小禾",
  grade: 3,
  interests: ["恐龙", "折纸"],
  dailyLimitMinutes: 30,
};

export const testLesson: Lesson = {
  id: "lesson-test-1",
  grade: 3,
  term: "upper",
  lessonNo: 2,
  title: "自编第二课",
  recognizeChars: ["山", "水", "火"],
  writeChars: ["日", "月", "田"],
  words: ["山水", "日月", "水田"],
  status: "approved",
};

export const testCard: CharCard = {
  id: "card-test-shan",
  char: "山",
  pinyin: "shān",
  radical: "山",
  explain: "“山”像三座连在一起的山峰。",
  words: ["高山", "山水"],
  confusable: ["出"],
  dictationContext: "山，高山的山",
  audioUrl: null,
  source: "自编内容，人工校订",
  status: "approved",
};

export const testPassage: Passage = {
  id: "passage-test-1",
  title: "小水塘",
  body: "门口有一个小水塘，水里有几片荷叶。",
  topic: "身边的小景",
  sourceType: "original",
  targetChars: ["水", "田"],
  outOfScopeCount: 0,
  question: "小水塘里有什么？",
  keyPoints: ["荷叶", "水"],
  status: "approved",
};

export const testChildChar: ChildChar = {
  childId: testChild.id,
  char: "山",
  kind: "write",
  stage: "recognize",
  correctStreak: 0,
  nextReviewOn: null,
  wrongCount: 0,
  lastSeenOn: null,
};

export const testHomeworkItem: HomeworkItem = {
  id: "homework-test-1",
  text: "读一读第二课的生字",
  kind: "recognize",
  supported: true,
  done: false,
};

export const testSession: Session = {
  id: "session-test-1",
  childId: testChild.id,
  startedAt: "2026-11-13T01:00:00.000Z",
  endedAt: null,
  homework: [testHomeworkItem],
};

export const testTurn: Turn = {
  id: "turn-test-1",
  sessionId: testSession.id,
  agent: "char_coach",
  model: "deepseek-chat",
  input: { step: "explain", char: "山" },
  output: { say: "这座山真高。", ask: "你能组一个词吗？", next: "wait_child" },
  inputTokens: 100,
  cachedInputTokens: 20,
  outputTokens: 30,
  latencyMs: 800,
  guardVerdict: "pass",
  createdAt: "2026-11-13T01:01:00.000Z",
};

export const testIncident: Incident = {
  id: "incident-test-1",
  type: "bad_question",
  turnId: testTurn.id,
  note: "测试用的编造记录",
  resolved: false,
  createdAt: "2026-11-13T01:02:00.000Z",
};
