-- DropIndex
DROP INDEX "Invoice_dineroInvoiceGuid_key";

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "combinedInvoicing" BOOLEAN NOT NULL DEFAULT false;
