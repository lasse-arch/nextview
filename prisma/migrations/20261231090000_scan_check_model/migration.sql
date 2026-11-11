-- Personer i scans: which Matterport model a scan was checked in, so a tour given a new model is checked again.
ALTER TABLE "TourScanCheck" ADD COLUMN "modelId" TEXT;
-- The checks so far: the model the tour has in its setup now (tours whose model comes from MPSkins stay empty = the current one).
UPDATE "TourScanCheck" c SET "modelId" = t."config"->>'modelId' FROM "Tour" t WHERE t."slug" = c."tourSlug" AND t."config"->>'modelId' IS NOT NULL;
