-- Generator → "Få et oplæg til touren": nextviewAI's tour proposals, shown in Arpo and on a read-only link.
CREATE TABLE "TourProposal" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "dealId" TEXT,
    "data" JSONB NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TourProposal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TourProposal_token_key" ON "TourProposal"("token");
CREATE INDEX "TourProposal_createdAt_idx" ON "TourProposal"("createdAt");
