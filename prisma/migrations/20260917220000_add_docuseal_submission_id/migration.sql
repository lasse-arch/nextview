-- AlterTable
ALTER TABLE "Deal" ADD COLUMN "docusealSubmissionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Deal_docusealSubmissionId_key" ON "Deal"("docusealSubmissionId");
