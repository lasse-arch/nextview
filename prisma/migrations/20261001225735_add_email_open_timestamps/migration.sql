-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "openTimestamps" TIMESTAMP(3)[] DEFAULT ARRAY[]::TIMESTAMP(3)[];
