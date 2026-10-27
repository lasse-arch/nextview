-- AlterTable
ALTER TABLE "Tour" ADD COLUMN     "reviewSentAt" TIMESTAMP(3),
ADD COLUMN     "reviewRemindedAt" TIMESTAMP(3),
ADD COLUMN     "reviewReminders" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reviewApprovedAt" TIMESTAMP(3),
ADD COLUMN     "reviewApprovedBy" TEXT;
