-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "signWellDocumentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Deal_signWellDocumentId_key" ON "Deal"("signWellDocumentId");
