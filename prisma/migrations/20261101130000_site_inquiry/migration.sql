-- CreateTable
CREATE TABLE "SiteInquiry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "interest" TEXT,
    "message" TEXT,
    "page" TEXT,
    "ip" TEXT NOT NULL,
    "dealId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteInquiry_ip_createdAt_idx" ON "SiteInquiry"("ip", "createdAt");
