-- CreateTable
CREATE TABLE "StandaloneContract" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "displayName" TEXT,
    "cvrNumber" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "address" TEXT,
    "soldProduct" TEXT,
    "bindingMonths" INTEGER,
    "saleAmount" INTEGER,
    "establishmentFee" INTEGER,
    "noticePeriodMonths" INTEGER NOT NULL DEFAULT 6,
    "additionalTerms" TEXT,
    "contractProducts" JSONB,
    "language" TEXT NOT NULL DEFAULT 'da',
    "docusealSubmissionId" TEXT,
    "contractStatus" "ContractStatus" NOT NULL DEFAULT 'NONE',
    "contractSentAt" TIMESTAMP(3),
    "contractViewedAt" TIMESTAMP(3),
    "contractSignedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandaloneContract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StandaloneContract_docusealSubmissionId_key" ON "StandaloneContract"("docusealSubmissionId");

-- AddForeignKey
ALTER TABLE "StandaloneContract" ADD CONSTRAINT "StandaloneContract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
