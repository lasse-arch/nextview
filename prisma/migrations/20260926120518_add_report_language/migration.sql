-- CreateEnum
CREATE TYPE "ReportLanguage" AS ENUM ('DA', 'EN');

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "reportLanguage" "ReportLanguage" NOT NULL DEFAULT 'DA';
