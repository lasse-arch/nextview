-- AlterTable
ALTER TABLE "LeadFilter" ADD COLUMN     "autoCreateDailyList" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "targetCallListId" TEXT;

-- AddForeignKey
ALTER TABLE "LeadFilter" ADD CONSTRAINT "LeadFilter_targetCallListId_fkey" FOREIGN KEY ("targetCallListId") REFERENCES "CallList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
