-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'SENT_MANUALLY';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "paidAt" TIMESTAMP(3);
