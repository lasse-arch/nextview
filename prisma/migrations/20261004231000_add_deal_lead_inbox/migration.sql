-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "inLeadInbox" BOOLEAN NOT NULL DEFAULT false;

-- Leads that came in through a ringeliste and never got a meeting move to
-- Leadindbakken; everything else (manually created leads, anything that has
-- had a meeting) stays on the Deals board.
UPDATE "Deal"
SET "inLeadInbox" = true
WHERE "callListId" IS NOT NULL
  AND "stage" IN ('LEAD', 'CONTACTED', 'LOST')
  AND "meetingDate" IS NULL;

CREATE INDEX "Deal_inLeadInbox_stage_idx" ON "Deal"("inLeadInbox", "stage");
