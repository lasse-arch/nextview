-- Generator → Spørg: the team's own answers (questions about the system, and objections), kept as a FAQ.
CREATE TABLE "SalesAnswer" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalesAnswer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SalesAnswer_kind_idx" ON "SalesAnswer"("kind");
