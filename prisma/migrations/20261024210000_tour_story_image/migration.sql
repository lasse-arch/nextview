-- CreateTable
CREATE TABLE "TourStoryImage" (
    "tourSlug" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "image" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TourStoryImage_pkey" PRIMARY KEY ("tourSlug","room")
);
