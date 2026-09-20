-- CreateEnum
CREATE TYPE "ReportSendStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "CustomerReport" ADD COLUMN "status" "ReportSendStatus" NOT NULL DEFAULT 'SENT',
    ADD COLUMN "errorMessage" TEXT;
