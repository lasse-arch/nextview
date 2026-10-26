-- AlterTable
ALTER TABLE "Tour" ADD COLUMN "reviewToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Tour_reviewToken_key" ON "Tour"("reviewToken");

-- CreateTable
CREATE TABLE "TourFeedback" (
    "id" TEXT NOT NULL,
    "tourSlug" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "author" TEXT,
    "href" TEXT,
    "ss" INTEGER,
    "room" TEXT,
    "image" TEXT,
    "device" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TourFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TourFeedback_tourSlug_createdAt_idx" ON "TourFeedback"("tourSlug", "createdAt");
