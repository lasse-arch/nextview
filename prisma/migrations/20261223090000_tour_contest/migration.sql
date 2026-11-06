-- "Skattejagt": entries to a treasure chest's draw.
CREATE TABLE "TourContestEntry" (
    "id" TEXT NOT NULL,
    "tourSlug" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "grade" TEXT,
    "infoOk" BOOLEAN NOT NULL DEFAULT false,
    "test" BOOLEAN NOT NULL DEFAULT false,
    "ipHash" TEXT NOT NULL,
    "winnerAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TourContestEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TourContestEntry_tourSlug_itemId_email_key" ON "TourContestEntry"("tourSlug", "itemId", "email");
CREATE INDEX "TourContestEntry_tourSlug_itemId_idx" ON "TourContestEntry"("tourSlug", "itemId");
