-- CreateEnum
CREATE TYPE "DownloadJobStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "ReportDownloadJob" (
    "id" TEXT NOT NULL,
    "dealIds" TEXT NOT NULL,
    "combined" BOOLEAN NOT NULL DEFAULT false,
    "status" "DownloadJobStatus" NOT NULL DEFAULT 'PENDING',
    "pdfData" BYTEA,
    "fileName" TEXT,
    "errorMessage" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportDownloadJob_pkey" PRIMARY KEY ("id")
);
