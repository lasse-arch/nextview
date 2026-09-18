-- "Underskrevet" (contractSignedAt) and "Fakturering starter" (billingStartDate)
-- could drift from "Solgt dato" (soldAt) and "Live dato" (liveAt) when an
-- admin corrected the sold/live date via "Ret manuelt" without the app also
-- correcting the two dependent dates (fixed in the app going forward - see
-- src/lib/actions/deals.ts). Backfill any deal already left in that state:
-- signing is the same event as the sale, and billing only starts once the
-- deal is actually live/delivered.
UPDATE "Deal"
SET "contractSignedAt" = "soldAt"
WHERE "soldAt" IS NOT NULL
  AND ("contractSignedAt" IS NULL OR "contractSignedAt" <> "soldAt");

UPDATE "Deal"
SET "billingStartDate" = "liveAt"
WHERE "stage" = 'LIVE'
  AND "liveAt" IS NOT NULL
  AND ("billingStartDate" IS NULL OR "billingStartDate" <> "liveAt");
