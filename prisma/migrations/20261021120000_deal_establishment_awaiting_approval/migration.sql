ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "establishmentAwaitingApproval" BOOLEAN NOT NULL DEFAULT false;
