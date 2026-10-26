-- CreateTable
CREATE TABLE "DeletedDeal" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deletedByName" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredAt" TIMESTAMP(3),

    CONSTRAINT "DeletedDeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeletedDeal_createdAt_idx" ON "DeletedDeal"("createdAt");
