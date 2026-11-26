-- The filming brief on the deal, and filmings again (Genoptagelse), also the contract's yearly one.
ALTER TABLE "Deal" ADD COLUMN "filmingDrone" BOOLEAN;
ALTER TABLE "Deal" ADD COLUMN "filmingBrief" TEXT;
ALTER TABLE "Deal" ADD COLUMN "filmingBriefAt" TIMESTAMP(3);
ALTER TABLE "Deal" ADD COLUMN "filmingBriefById" TEXT;

CREATE TABLE "Refilming" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "crewIds" TEXT NOT NULL,
    "eventId" TEXT,
    "drone" BOOLEAN,
    "brief" TEXT,
    "annual" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    CONSTRAINT "Refilming_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Refilming_dealId_at_idx" ON "Refilming"("dealId", "at");
ALTER TABLE "Refilming" ADD CONSTRAINT "Refilming_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
