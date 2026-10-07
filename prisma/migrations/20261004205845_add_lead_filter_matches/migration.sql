-- CreateTable
CREATE TABLE "LeadFilterMatch" (
    "filterId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadFilterMatch_pkey" PRIMARY KEY ("filterId","candidateId")
);

-- CreateIndex
CREATE INDEX "LeadFilterMatch_filterId_handledAt_idx" ON "LeadFilterMatch"("filterId", "handledAt");

-- AddForeignKey
ALTER TABLE "LeadFilterMatch" ADD CONSTRAINT "LeadFilterMatch_filterId_fkey" FOREIGN KEY ("filterId") REFERENCES "LeadFilter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadFilterMatch" ADD CONSTRAINT "LeadFilterMatch_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "LeadCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every candidate a filter already found becomes that filter's
-- match. Still-unreviewed (NEW) ones stay in the list; already-reviewed ones
-- are marked handled, so a later run re-finding them doesn't resurface them.
INSERT INTO "LeadFilterMatch" ("filterId", "candidateId", "handledAt", "createdAt")
SELECT "filterId", "id", CASE WHEN "status" = 'NEW' THEN NULL ELSE CURRENT_TIMESTAMP END, "createdAt"
FROM "LeadCandidate"
WHERE "filterId" IS NOT NULL;
