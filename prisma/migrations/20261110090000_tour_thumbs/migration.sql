-- CreateTable
CREATE TABLE "TourThumb" (
    "key" TEXT NOT NULL,
    "data" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TourThumb_pkey" PRIMARY KEY ("key")
);
