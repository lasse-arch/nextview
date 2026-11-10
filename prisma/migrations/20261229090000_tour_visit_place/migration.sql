-- Where a tour visit came from, roughly (town, ~10 km) - for the map in the tour's statistics.
CREATE TABLE "TourVisitPlace" (
    "id" TEXT NOT NULL,
    "tourSlug" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TourVisitPlace_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TourVisitPlace_tourSlug_session_key" ON "TourVisitPlace"("tourSlug", "session");
CREATE INDEX "TourVisitPlace_tourSlug_createdAt_idx" ON "TourVisitPlace"("tourSlug", "createdAt");
