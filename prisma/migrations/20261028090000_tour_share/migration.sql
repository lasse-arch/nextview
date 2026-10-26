-- AlterTable
ALTER TABLE "Tour" ADD COLUMN "share" JSONB,
ADD COLUMN "shareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Tour_shareToken_key" ON "Tour"("shareToken");
