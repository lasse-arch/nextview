-- DropIndex
DROP INDEX "Invoice_dealId_quarterIndex_key";

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "churnedAt" TIMESTAMP(3),
ADD COLUMN     "contractLink" TEXT,
ADD COLUMN     "currentTermNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "establishmentFee" INTEGER;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "termNumber" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ContractRenewal" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "termNumber" INTEGER NOT NULL,
    "previousValue" INTEGER NOT NULL,
    "previousBindingMonths" INTEGER NOT NULL,
    "newValue" INTEGER NOT NULL,
    "newBindingMonths" INTEGER NOT NULL,
    "contractLink" TEXT,
    "establishmentFee" INTEGER,
    "renewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractRenewal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_dealId_termNumber_quarterIndex_key" ON "Invoice"("dealId", "termNumber", "quarterIndex");

-- AddForeignKey
ALTER TABLE "ContractRenewal" ADD CONSTRAINT "ContractRenewal_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

