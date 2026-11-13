-- CreateTable
CREATE TABLE "Child" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nickname" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "interests" TEXT NOT NULL,
    "dailyLimitMinutes" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "grade" INTEGER NOT NULL,
    "term" TEXT NOT NULL,
    "lessonNo" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "recognizeChars" TEXT NOT NULL,
    "writeChars" TEXT NOT NULL,
    "words" TEXT NOT NULL,
    "status" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "CharCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "char" TEXT NOT NULL,
    "pinyin" TEXT NOT NULL,
    "radical" TEXT NOT NULL,
    "explain" TEXT NOT NULL,
    "words" TEXT NOT NULL,
    "confusable" TEXT NOT NULL,
    "dictationContext" TEXT NOT NULL,
    "audioUrl" TEXT,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Passage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "targetChars" TEXT NOT NULL,
    "outOfScopeCount" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "keyPoints" TEXT NOT NULL,
    "status" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ChildChar" (
    "childId" TEXT NOT NULL,
    "char" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "correctStreak" INTEGER NOT NULL,
    "nextReviewOn" TEXT,
    "wrongCount" INTEGER NOT NULL,
    "lastSeenOn" TEXT,

    PRIMARY KEY ("childId", "char")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "childId" TEXT NOT NULL,
    "startedAt" TEXT NOT NULL,
    "endedAt" TEXT,
    "homework" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Turn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "cachedInputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "guardVerdict" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "turnId" TEXT,
    "note" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL,
    "createdAt" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "SessionRuntime" (
    "sessionId" TEXT NOT NULL PRIMARY KEY,
    "state" TEXT NOT NULL,
    "context" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "CharCard_char_key" ON "CharCard"("char");

-- CreateIndex
CREATE INDEX "ChildChar_childId_idx" ON "ChildChar"("childId");

-- CreateIndex
CREATE INDEX "Session_childId_idx" ON "Session"("childId");

-- CreateIndex
CREATE INDEX "Turn_sessionId_idx" ON "Turn"("sessionId");
