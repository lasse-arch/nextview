CREATE TABLE "TourTipRun" (
    "id" TEXT NOT NULL,
    "tourSlug" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "suggestions" JSONB NOT NULL,
    "visits" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'hånd',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TourTipRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TourTipRun_tourSlug_createdAt_idx" ON "TourTipRun"("tourSlug", "createdAt");
