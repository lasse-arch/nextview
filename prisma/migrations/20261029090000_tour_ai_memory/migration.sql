-- CreateTable
CREATE TABLE "TourAiMemory" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TourAiMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteCache" (
    "url" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteCache_pkey" PRIMARY KEY ("url")
);

-- CreateIndex
CREATE INDEX "TourAiMemory_scope_idx" ON "TourAiMemory"("scope");
