-- CreateTable
CREATE TABLE "ContractEvent" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractEvent_dealId_occurredAt_idx" ON "ContractEvent"("dealId", "occurredAt");

-- AddForeignKey
ALTER TABLE "ContractEvent" ADD CONSTRAINT "ContractEvent_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
