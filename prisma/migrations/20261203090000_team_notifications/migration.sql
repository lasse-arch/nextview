ALTER TABLE "User" ADD COLUMN "notificationsSeenAt" TIMESTAMP(3);
ALTER TABLE "TourFeedback" ADD COLUMN "topic" TEXT;

CREATE TABLE "TeamNotification" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "tourSlug" TEXT,
    "audience" TEXT NOT NULL DEFAULT 'admin',
    "count" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeamNotification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TeamNotification_updatedAt_idx" ON "TeamNotification"("updatedAt");
CREATE INDEX "TeamNotification_kind_tourSlug_updatedAt_idx" ON "TeamNotification"("kind", "tourSlug", "updatedAt");
