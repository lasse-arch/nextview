-- Messages sent with a tour's contact form.
CREATE TABLE "TourMessage" (
    "id" TEXT NOT NULL,
    "tourSlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "message" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TourMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TourMessage_tourSlug_createdAt_idx" ON "TourMessage"("tourSlug", "createdAt");
CREATE INDEX "TourMessage_ipHash_createdAt_idx" ON "TourMessage"("ipHash", "createdAt");
