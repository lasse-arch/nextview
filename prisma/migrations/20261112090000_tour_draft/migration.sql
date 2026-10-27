-- The tour editor's autosaved, not yet saved changes.
ALTER TABLE "Tour" ADD COLUMN "draft" JSONB;
ALTER TABLE "Tour" ADD COLUMN "draftAt" TIMESTAMP(3);
ALTER TABLE "Tour" ADD COLUMN "draftByName" TEXT;
