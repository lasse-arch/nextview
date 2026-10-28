-- CreateTable
CREATE TABLE "DeletedTour" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deletedByName" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredAt" TIMESTAMP(3),

    CONSTRAINT "DeletedTour_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeletedTour_slug_idx" ON "DeletedTour"("slug");

-- CreateIndex
CREATE INDEX "DeletedTour_createdAt_idx" ON "DeletedTour"("createdAt");
