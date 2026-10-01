-- AlterTable
ALTER TABLE "CustomerReport" ADD COLUMN     "trackingId" TEXT,
ADD COLUMN     "openedAt" TIMESTAMP(3),
ADD COLUMN     "openCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "CustomerReport_trackingId_key" ON "CustomerReport"("trackingId");
