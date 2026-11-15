CREATE TABLE "SessionOrigin" (
  "sessionId" TEXT NOT NULL PRIMARY KEY,
  "childId" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL
);
CREATE INDEX "SessionOrigin_childId_idx" ON "SessionOrigin"("childId");
