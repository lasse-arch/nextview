-- AlterTable
ALTER TABLE "Tour" ADD COLUMN "oldSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN "filmingActualMinutes" INTEGER;

-- CreateTable
CREATE TABLE "TourWork" (
    "id" TEXT NOT NULL,
    "tourSlug" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TourWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourAiUsage" (
    "id" TEXT NOT NULL,
    "tourSlug" TEXT NOT NULL,
    "userName" TEXT,
    "kind" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TourAiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TourWork_tourSlug_idx" ON "TourWork"("tourSlug");

-- CreateIndex
CREATE UNIQUE INDEX "TourWork_tourSlug_userId_day_key" ON "TourWork"("tourSlug", "userId", "day");

-- CreateIndex
CREATE INDEX "TourAiUsage_tourSlug_idx" ON "TourAiUsage"("tourSlug");
