-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('NONE', 'SENT', 'VIEWED', 'SIGNED', 'DECLINED', 'VOIDED');

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "contractSentAt" TIMESTAMP(3),
ADD COLUMN     "contractSignedAt" TIMESTAMP(3),
ADD COLUMN     "contractStatus" "ContractStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "contractViewedAt" TIMESTAMP(3),
ADD COLUMN     "pandaDocDocumentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Deal_pandaDocDocumentId_key" ON "Deal"("pandaDocDocumentId");

