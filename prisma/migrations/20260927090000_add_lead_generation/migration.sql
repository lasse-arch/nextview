-- CreateEnum
CREATE TYPE "LeadCandidateStatus" AS ENUM ('NEW', 'ADDED', 'DISMISSED');

-- CreateTable
CREATE TABLE "LeadFilter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industryQuery" TEXT,
    "municipality" TEXT,
    "activeOnly" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadFilter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadCandidate" (
    "id" TEXT NOT NULL,
    "filterId" TEXT,
    "cvrNumber" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "address" TEXT,
    "industryText" TEXT,
    "foundedDate" TIMESTAMP(3),
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "status" "LeadCandidateStatus" NOT NULL DEFAULT 'NEW',
    "dealId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadCandidate_cvrNumber_key" ON "LeadCandidate"("cvrNumber");

-- CreateIndex
CREATE INDEX "LeadCandidate_status_createdAt_idx" ON "LeadCandidate"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "LeadFilter" ADD CONSTRAINT "LeadFilter_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCandidate" ADD CONSTRAINT "LeadCandidate_filterId_fkey" FOREIGN KEY ("filterId") REFERENCES "LeadFilter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
