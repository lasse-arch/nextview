-- CreateTable
CREATE TABLE "TourEvent" (
    "id" TEXT NOT NULL,
    "tourSlug" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT,
    "url" TEXT,
    "device" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TourEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourFile" (
    "id" TEXT NOT NULL,
    "tourSlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA,
    "url" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TourFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TourEvent_tourSlug_createdAt_idx" ON "TourEvent"("tourSlug", "createdAt");

-- CreateIndex
CREATE INDEX "TourFile_tourSlug_idx" ON "TourFile"("tourSlug");
