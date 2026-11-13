CREATE TABLE "SessionCommand" (
 "sequence" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
 "scope" TEXT NOT NULL, "key" TEXT NOT NULL, "fingerprint" TEXT NOT NULL,
 "kind" TEXT NOT NULL, "sessionId" TEXT, "phase" TEXT NOT NULL,
 "pending" TEXT NOT NULL, "response" TEXT
);
CREATE UNIQUE INDEX "SessionCommand_scope_key_key" ON "SessionCommand"("scope", "key");
CREATE UNIQUE INDEX "SessionCommand_sequence_key" ON "SessionCommand"("sequence");
CREATE INDEX "SessionCommand_sessionId_sequence_idx" ON "SessionCommand"("sessionId", "sequence");
CREATE TABLE "CoachRuntime" ("sessionId" TEXT NOT NULL PRIMARY KEY, "data" TEXT NOT NULL);
