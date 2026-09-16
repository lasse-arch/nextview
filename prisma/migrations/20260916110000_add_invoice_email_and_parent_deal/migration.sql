-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "invoiceEmail" TEXT,
ADD COLUMN     "parentDealId" TEXT;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_parentDealId_fkey" FOREIGN KEY ("parentDealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
