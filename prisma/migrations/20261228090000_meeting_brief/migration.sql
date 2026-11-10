-- Generator → Spørg → "Gør mig klar til møde": the briefs nextviewAI made before a meeting.
CREATE TABLE "MeetingBrief" (
    "id" TEXT NOT NULL,
    "meetingKey" TEXT NOT NULL,
    "dealId" TEXT,
    "title" TEXT NOT NULL,
    "meetingAt" TIMESTAMP(3),
    "body" TEXT NOT NULL,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetingBrief_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MeetingBrief_meetingKey_idx" ON "MeetingBrief"("meetingKey");
CREATE INDEX "MeetingBrief_createdAt_idx" ON "MeetingBrief"("createdAt");
