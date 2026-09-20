-- CreateEnum
CREATE TYPE "ReportInterval" AS ENUM ('MONTHLY', 'BIMONTHLY', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "ReportSendMethod" AS ENUM ('MANUAL', 'AUTOMATIC');

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN "mpSkinId" TEXT,
    ADD COLUMN "reportInterval" "ReportInterval",
    ADD COLUMN "nextReportDueAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CustomerReport" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" "ReportSendMethod" NOT NULL,
    "pdfDriveUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerReport_dealId_sentAt_idx" ON "CustomerReport"("dealId", "sentAt");

-- AddForeignKey
ALTER TABLE "CustomerReport" ADD CONSTRAINT "CustomerReport_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
