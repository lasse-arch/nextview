-- CreateTable
CREATE TABLE "TourScanCheck" (
    "id" TEXT NOT NULL,
    "tourSlug" TEXT NOT NULL,
    "sweepId" TEXT NOT NULL,
    "ss" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "face" INTEGER,
    "note" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedBy" TEXT,

    CONSTRAINT "TourScanCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TourScanCheck_tourSlug_sweepId_key" ON "TourScanCheck"("tourSlug", "sweepId");

-- CreateIndex
CREATE INDEX "TourScanCheck_tourSlug_status_idx" ON "TourScanCheck"("tourSlug", "status");
