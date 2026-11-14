-- CreateTable
CREATE TABLE "LearningOutcome" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "commandScope" TEXT NOT NULL,
    "commandKey" TEXT NOT NULL,
    "effectIndex" INTEGER NOT NULL,
    "char" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "stageBefore" TEXT NOT NULL,
    "stageAfter" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "occurredAt" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "SessionLearningCoverage" (
    "sessionId" TEXT NOT NULL PRIMARY KEY,
    "startedAt" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "NightlyJob" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "childId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "leaseToken" TEXT,
    "leaseUntil" TEXT,
    "final" TEXT
);

-- CreateTable
CREATE TABLE "NightlyStep" (
    "jobId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "inputFingerprint" TEXT NOT NULL,
    "reusedFromJobId" INTEGER,
    "status" TEXT NOT NULL,
    "result" TEXT,
    "error" TEXT,

    PRIMARY KEY ("jobId", "key", "inputFingerprint")
);

-- CreateTable
CREATE TABLE "NightlyPublication" (
    "childId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "jobId" INTEGER NOT NULL,
    "data" TEXT NOT NULL,

    PRIMARY KEY ("childId", "date", "timezone")
);

-- CreateIndex
CREATE INDEX "LearningOutcome_childId_occurredAt_idx" ON "LearningOutcome"("childId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "LearningOutcome_commandScope_commandKey_effectIndex_key" ON "LearningOutcome"("commandScope", "commandKey", "effectIndex");

-- CreateIndex
CREATE UNIQUE INDEX "NightlyJob_childId_date_timezone_sourceVersion_key" ON "NightlyJob"("childId", "date", "timezone", "sourceVersion");

-- 历史流水只能追加。禁止通过直接SQL意外改写或删除旧事实。
CREATE TRIGGER "LearningOutcome_no_update" BEFORE UPDATE ON "LearningOutcome"
BEGIN SELECT RAISE(ABORT, 'LearningOutcome is append-only'); END;
CREATE TRIGGER "LearningOutcome_no_delete" BEFORE DELETE ON "LearningOutcome"
BEGIN SELECT RAISE(ABORT, 'LearningOutcome is append-only'); END;
