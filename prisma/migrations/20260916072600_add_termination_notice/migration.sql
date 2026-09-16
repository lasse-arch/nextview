-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "contractEndDate" TIMESTAMP(3),
ADD COLUMN     "noticePeriodMonths" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "terminationNoticeAt" TIMESTAMP(3);
