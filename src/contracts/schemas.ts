/**
 * 契约文件：数据结构与各 Agent 的输入输出。
 * 所有任务包只依赖本目录，不依赖彼此的实现。
 * 修改本文件需要总设计师批准（见 docs/WORKFLOW.md 的“改契约”一节）。
 */
import { z } from "zod";

/* ---------- 基础类型 ---------- */

export const Id = z.string().min(1);
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/); // 2026-11-13
export const IsoDateTime = z.string().datetime();

export const ReviewStatus = z.enum(["draft", "reviewed", "approved", "rejected"]);

/** 一个字要过的关。recognize_only 的字跳过 write。 */
export const CharStage = z.enum([
  "recognize", // 1 认读
  "understand", // 2 理解
  "write", // 3 书写
  "review_2d", // 4a 两天后复习
  "review_7d", // 4b 七天后复习
  "mastered", // 已掌握；在课外短文中“重逢”不改变状态，只记录
]);
export type CharStage = z.infer<typeof CharStage>;

export const CharKind = z.enum(["recognize_only", "write"]); // 会认字 / 会写字
export type CharKind = z.infer<typeof CharKind>;

/* ---------- 内容库（离线生产，运行时只读） ---------- */

export const Lesson = z.object({
  id: Id,
  grade: z.number().int().min(1).max(6),
  term: z.enum(["upper", "lower"]), // 上册 / 下册
  lessonNo: z.number().int().min(1),
  title: z.string(),
  recognizeChars: z.array(z.string().length(1)), // 会认字
  writeChars: z.array(z.string().length(1)), // 会写字
  words: z.array(z.string().min(1)), // 词语表
  status: ReviewStatus,
});
export type Lesson = z.infer<typeof Lesson>;

export const CharCard = z.object({
  id: Id,
  char: z.string().length(1),
  pinyin: z.string(), // 带声调，如 "xiū"
  radical: z.string(),
  explain: z.string(), // 这个字为什么这么写，两三句
  words: z.array(z.string()).min(1), // 组词
  confusable: z.array(z.string().length(1)), // 形近字
  dictationContext: z.string(), // 报词语境，如 "休，休息的休"
  audioUrl: z.string().nullable(), // 预先合成的报词音频
  source: z.string(), // 讲解的出处，人工填写
  status: ReviewStatus,
});
export type CharCard = z.infer<typeof CharCard>;

export const Passage = z.object({
  id: Id,
  title: z.string(),
  body: z.string(),
  topic: z.string(),
  sourceType: z.enum(["original", "public_domain"]),
  targetChars: z.array(z.string().length(1)), // 刻意放进去的复习字
  outOfScopeCount: z.number().int().min(0), // 超纲字数，由代码统计
  question: z.string(), // 读后问题
  keyPoints: z.array(z.string()), // 参考要点，只用于追问，不念给孩子
  status: ReviewStatus,
});
export type Passage = z.infer<typeof Passage>;

/* ---------- 孩子与学习记录 ---------- */

export const Child = z.object({
  id: Id,
  nickname: z.string(),
  grade: z.number().int().min(1).max(6),
  interests: z.array(z.string()).max(5),
  dailyLimitMinutes: z.number().int().min(5).max(60).default(40),
});
export type Child = z.infer<typeof Child>;

export const ChildChar = z.object({
  childId: Id,
  char: z.string().length(1),
  kind: CharKind,
  stage: CharStage,
  correctStreak: z.number().int().min(0),
  nextReviewOn: IsoDate.nullable(),
  wrongCount: z.number().int().min(0),
  lastSeenOn: IsoDate.nullable(),
});
export type ChildChar = z.infer<typeof ChildChar>;

export const HomeworkItem = z.object({
  id: Id,
  text: z.string(), // 孩子能看懂的一句话
  kind: z.enum(["recognize", "copy", "dictation", "read_aloud", "essay", "other"]),
  supported: z.boolean(), // 系统能不能带着做；不能的只让孩子打勾
  done: z.boolean(),
});
export type HomeworkItem = z.infer<typeof HomeworkItem>;

export const Session = z.object({
  id: Id,
  childId: Id,
  startedAt: IsoDateTime,
  endedAt: IsoDateTime.nullable(),
  homework: z.array(HomeworkItem),
});
export type Session = z.infer<typeof Session>;

export const AgentName = z.enum([
  "vision_homework",
  "vision_dictation",
  "char_coach",
  "reader",
  "essay",
  "guard",
  "score",
  "report",
]);
export type AgentName = z.infer<typeof AgentName>;

export const Turn = z.object({
  id: Id,
  sessionId: Id,
  agent: AgentName,
  model: z.string(),
  // 契约2.11：显式保留Zod3原有的缺键语义，兼容修补版Zod4。
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  inputTokens: z.number().int(),
  cachedInputTokens: z.number().int(),
  outputTokens: z.number().int(),
  latencyMs: z.number().int(),
  guardVerdict: z.enum(["pass", "blocked", "skipped"]),
  createdAt: IsoDateTime,
});
export type Turn = z.infer<typeof Turn>;

export const IncidentType = z.enum(["recognition", "knowledge", "bad_question", "ghostwriting", "safety"]);

export const Incident = z.object({
  id: Id,
  type: IncidentType,
  turnId: Id.nullable(),
  note: z.string(),
  resolved: z.boolean(),
  createdAt: IsoDateTime,
});
export type Incident = z.infer<typeof Incident>;

/* ---------- Agent 输入输出 ---------- */

const ChildBrief = Child.pick({ id: true, grade: true, interests: true });
const HistoryItem = z.object({ role: z.enum(["child", "agent"]), text: z.string() });
/** 对话历史最多带最近 6 轮（12 条）。 */
const History = z.array(HistoryItem).max(12);

/** 所有对话类 Agent 的输出外壳。 */
const Speak = z.object({
  say: z.string().max(80), // 给孩子的话，不超过两句
  ask: z.string().max(60).nullable(), // 请孩子做的一件事
  next: z.enum(["wait_child", "step_done", "escalate"]),
});

// 识别：作业清单
export const VisionHomeworkInput = z.object({
  imageUrl: z.string().nullable(),
  spokenText: z.string().nullable(),
});
export const VisionHomeworkOutput = z.object({
  items: z.array(HomeworkItem.omit({ id: true, done: true })),
  unsure: z.boolean(), // 看不清时为 true，界面请孩子重拍
});

// 识别：听写对照
export const VisionDictationInput = z.object({
  imageUrl: z.string(),
  expectedWords: z.array(z.string().min(1)),
});
export const DictationMark = z.object({
  word: z.string(),
  charIndex: z.number().int().min(0),
  expected: z.string().length(1),
  box: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(), // x,y,w,h，0–1 归一化
  suspicious: z.boolean(), // “这里可能不一样”，最终由孩子对照确认
  confidence: z.number().min(0).max(1),
});
export const VisionDictationOutput = z.object({
  marks: z.array(DictationMark),
  unreadable: z.boolean(),
});

// 认字教练
export const CharCoachInput = z.object({
  child: ChildBrief,
  card: CharCard,
  step: z.enum(["explain", "make_word", "make_sentence"]),
  history: History,
});
export const CharCoachOutput = Speak.extend({
  usedCardFields: z.array(z.enum(["explain", "words", "confusable", "pinyin", "radical"])),
});

// 阅读伙伴
export const ReaderInput = z.object({
  child: ChildBrief,
  passage: Passage.pick({ id: true, title: true, body: true, question: true, keyPoints: true }),
  step: z.enum(["ask", "follow_up", "wrap_up"]),
  history: History,
});
export const ReaderOutput = Speak;

// 作文采访
export const EssayInput = z.object({
  child: ChildBrief,
  topic: z.string(),
  step: z.enum(["interview", "reader_feedback"]),
  cards: z.array(z.string()), // 已有素材卡，孩子的原话
  essayText: z.string().nullable(), // reader_feedback 时为作文的识别文本
  history: History,
});
export const EssayOutput = Speak.extend({
  newCard: z.string().nullable(), // 必须是孩子上一句话的原文或其子串
});

// 护栏
export const GuardInput = z.object({
  agent: AgentName,
  candidate: z.string(), // 待审查的 say + ask
  context: z.enum(["char", "reading", "essay"]),
});
export const GuardOutput = z.object({
  verdict: z.enum(["pass", "blocked"]),
  reason: z.enum(["none", "ghostwriting", "answer_leak", "off_scope", "unsafe", "too_long", "no_card_reference"]),
  layer: z.enum(["rule", "model"]),
});

// 夜间：评分与日报
export const ScoreInput = z.object({
  question: z.string(),
  keyPoints: z.array(z.string()),
  transcript: z.string(),
});
export const ScoreOutput = z.object({
  score: z.number().int().min(0).max(3),
  reason: z.string().max(60),
});

export const ReportInput = z.object({
  child: Child.pick({ id: true, nickname: true }),
  date: IsoDate,
  minutes: z.number().int(),
  homework: z.array(HomeworkItem),
  wrongChars: z.array(z.string().length(1)),
  retellScore: z.number().int().min(0).max(3).nullable(),
});
export const ReportOutput = z.object({
  lines: z.array(z.string().max(80)).min(1).max(4),
  parentAction: z.string().max(40), // “需要你做的”，没有就写“今天不需要”
});

export type VisionHomeworkInput = z.infer<typeof VisionHomeworkInput>;
export type VisionHomeworkOutput = z.infer<typeof VisionHomeworkOutput>;
export type VisionDictationInput = z.infer<typeof VisionDictationInput>;
export type VisionDictationOutput = z.infer<typeof VisionDictationOutput>;
export type CharCoachInput = z.infer<typeof CharCoachInput>;
export type CharCoachOutput = z.infer<typeof CharCoachOutput>;
export type ReaderInput = z.infer<typeof ReaderInput>;
export type ReaderOutput = z.infer<typeof ReaderOutput>;
export type EssayInput = z.infer<typeof EssayInput>;
export type EssayOutput = z.infer<typeof EssayOutput>;
export type GuardInput = z.infer<typeof GuardInput>;
export type GuardOutput = z.infer<typeof GuardOutput>;
export type ScoreInput = z.infer<typeof ScoreInput>;
export type ScoreOutput = z.infer<typeof ScoreOutput>;
export type ReportInput = z.infer<typeof ReportInput>;
export type ReportOutput = z.infer<typeof ReportOutput>;
