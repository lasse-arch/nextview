-- AlterTable
ALTER TABLE "LeadCandidate" ADD COLUMN     "importListId" TEXT,
ALTER COLUMN "cvrNumber" DROP NOT NULL;

-- CreateTable
CREATE TABLE "LeadImportList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadImportList_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LeadCandidate" ADD CONSTRAINT "LeadCandidate_importListId_fkey" FOREIGN KEY ("importListId") REFERENCES "LeadImportList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadImportList" ADD CONSTRAINT "LeadImportList_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
