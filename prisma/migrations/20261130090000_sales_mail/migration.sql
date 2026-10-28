-- CreateTable
CREATE TABLE "SalesMail" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "dealId" TEXT,
    "kind" TEXT NOT NULL,
    "industry" TEXT,
    "input" JSONB NOT NULL,
    "subject" TEXT NOT NULL,
    "draft" TEXT NOT NULL,
    "finalSubject" TEXT,
    "finalBody" TEXT,
    "finalHow" TEXT,
    "finalAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesMail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesMail_userId_finalAt_idx" ON "SalesMail"("userId", "finalAt");

-- CreateIndex
CREATE INDEX "SalesMail_finalAt_idx" ON "SalesMail"("finalAt");
