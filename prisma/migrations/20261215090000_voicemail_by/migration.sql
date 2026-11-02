-- Who pressed "Telefonsvar" last on the ringeliste, and how many times in all.
ALTER TABLE "Deal" ADD COLUMN "lastVoicemailBy" TEXT;
ALTER TABLE "Deal" ADD COLUMN "voicemailCount" INTEGER NOT NULL DEFAULT 0;
-- Leads already marked count as one try.
UPDATE "Deal" SET "voicemailCount" = 1 WHERE "lastVoicemailAt" IS NOT NULL;
