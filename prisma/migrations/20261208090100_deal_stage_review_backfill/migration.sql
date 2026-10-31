-- Deals whose tour is with the customer now (sent for review, not out yet) move to the new stage.
-- (A separate migration: a new enum value can't be used in the transaction that adds it.)
UPDATE "Deal" SET stage = 'REVIEW'
WHERE stage IN ('CONTRACT_SIGNED', 'FILMED')
  AND id IN (SELECT "dealId" FROM "Tour" WHERE "dealId" IS NOT NULL AND "reviewSentAt" IS NOT NULL AND "liveVersion" IS NULL);
