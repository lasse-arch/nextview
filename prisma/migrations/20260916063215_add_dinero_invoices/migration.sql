-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'DRAFT_CREATED', 'FAILED');

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "dineroContactGuid" TEXT;

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "quarterIndex" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "dineroInvoiceGuid" TEXT,
    "dineroInvoiceNumber" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_dineroInvoiceGuid_key" ON "Invoice"("dineroInvoiceGuid");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_dealId_quarterIndex_key" ON "Invoice"("dealId", "quarterIndex");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

