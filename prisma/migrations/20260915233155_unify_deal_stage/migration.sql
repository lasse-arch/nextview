-- Unify DealStage into a single sales+delivery pipeline and drop the
-- separate ProductionStatus concept (folded into DealStage: FILMED, LIVE).

ALTER TABLE "Deal" ALTER COLUMN "stage" DROP DEFAULT;

CREATE TYPE "DealStage_new" AS ENUM ('LEAD', 'CONTACTED', 'MEETING_BOOKED', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'FILMED', 'LIVE', 'LOST');

-- Map old values that no longer exist to their closest equivalent in the new pipeline.
ALTER TABLE "Deal" ALTER COLUMN "stage" TYPE "DealStage_new" USING (
  CASE "stage"::text
    WHEN 'NEGOTIATING' THEN 'MEETING_BOOKED'
    WHEN 'WON' THEN 'CONTRACT_SIGNED'
    ELSE "stage"::text
  END
)::"DealStage_new";

ALTER TABLE "Deal" ALTER COLUMN "stage" SET DEFAULT 'LEAD';

DROP TYPE "DealStage";
ALTER TYPE "DealStage_new" RENAME TO "DealStage";

-- Drop the old production-tracking column/type (superseded by DealStage FILMED/LIVE).
ALTER TABLE "Deal" DROP COLUMN "productionStatus";
ALTER TABLE "Deal" DROP COLUMN "deliveredAt";
ALTER TABLE "Deal" DROP COLUMN "completedAt";
DROP TYPE "ProductionStatus";

-- New fields.
ALTER TABLE "Deal" ADD COLUMN "meetingDate" TIMESTAMP(3);
ALTER TABLE "Deal" ADD COLUMN "liveAt" TIMESTAMP(3);
