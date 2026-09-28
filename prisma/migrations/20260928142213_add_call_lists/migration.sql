-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "callListId" TEXT;

-- CreateTable
CREATE TABLE "CallList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallList_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CallList" ADD CONSTRAINT "CallList_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_callListId_fkey" FOREIGN KEY ("callListId") REFERENCES "CallList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
