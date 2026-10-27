-- What a published version was built from, so "Udgiv" can tell when nothing has changed.
ALTER TABLE "TourPublication" ADD COLUMN "configHash" TEXT;
