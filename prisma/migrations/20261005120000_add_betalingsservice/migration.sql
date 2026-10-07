-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('INVOICE', 'BETALINGSSERVICE');

-- CreateEnum
CREATE TYPE "BsMandateStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BsCollectionStatus" AS ENUM ('IN_FILE', 'PAID', 'REJECTED', 'CANCELLED', 'CHARGED_BACK');

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "bsCustomerNumber" TEXT,
ADD COLUMN     "bsMandateChangedAt" TIMESTAMP(3),
ADD COLUMN     "bsMandateNumber" TEXT,
ADD COLUMN     "bsMandateStatus" "BsMandateStatus",
ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'INVOICE';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "bsCollectionId" TEXT,
ADD COLUMN     "collectViaBs" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bsPaymentError" TEXT,
ADD COLUMN     "bsPaymentRegisteredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BsSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "dataSupplierNumber" TEXT,
    "subsystem" TEXT NOT NULL DEFAULT 'BS1',
    "pbsNumber" TEXT,
    "debtorGroupNumber" TEXT,
    "depositAccountNumber" INTEGER,
    "nextDeliverySequence" INTEGER NOT NULL DEFAULT 1,
    "nextCustomerNumber" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BsSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BsDelivery" (
    "id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "collectionCount" INTEGER NOT NULL,
    "totalOre" INTEGER NOT NULL,
    "firstDueDate" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BsDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BsCollection" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "customerNumber" TEXT NOT NULL,
    "mandateNumber" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amountOre" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "BsCollectionStatus" NOT NULL DEFAULT 'IN_FILE',
    "statusAt" TIMESTAMP(3),
    "channel" TEXT,
    "paidAmountOre" INTEGER,
    "paymentDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BsCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BsReturnImport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "deliveryType" TEXT NOT NULL,
    "paymentCount" INTEGER NOT NULL,
    "mandateCount" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BsReturnImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BsDelivery_sequence_key" ON "BsDelivery"("sequence");

-- CreateIndex
CREATE INDEX "BsCollection_customerNumber_reference_idx" ON "BsCollection"("customerNumber", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "BsReturnImport_contentHash_key" ON "BsReturnImport"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_bsCustomerNumber_key" ON "Deal"("bsCustomerNumber");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_bsCollectionId_fkey" FOREIGN KEY ("bsCollectionId") REFERENCES "BsCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BsDelivery" ADD CONSTRAINT "BsDelivery_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BsCollection" ADD CONSTRAINT "BsCollection_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "BsDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BsCollection" ADD CONSTRAINT "BsCollection_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BsReturnImport" ADD CONSTRAINT "BsReturnImport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

