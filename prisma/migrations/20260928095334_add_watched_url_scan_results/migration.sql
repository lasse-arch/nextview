-- AlterTable
ALTER TABLE "WatchedUrl" ADD COLUMN     "lastAddedCount" INTEGER,
ADD COLUMN     "lastArticlesScanned" INTEGER,
ADD COLUMN     "lastCvrCount" INTEGER,
ADD COLUMN     "lastError" TEXT;
