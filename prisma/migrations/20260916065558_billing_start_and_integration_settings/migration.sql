-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'IMPORTED';

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "billingStartDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "IntegrationSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationSetting_key_key" ON "IntegrationSetting"("key");

