-- AlterTable
ALTER TABLE "Tour" ADD COLUMN     "liveVersion" INTEGER;

-- CreateTable
CREATE TABLE "TourPublication" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "files" JSONB NOT NULL,
    "engine" TEXT NOT NULL,
    "note" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TourPublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TourPublication_tourId_version_key" ON "TourPublication"("tourId", "version");

-- AddForeignKey
ALTER TABLE "TourPublication" ADD CONSTRAINT "TourPublication_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;
