-- "Fremvisning": secret, read-only showcase links for new customers, one per recipient, and what happened on them.
CREATE TABLE "TourDemoLink" (
    "id" TEXT NOT NULL,
    "tourSlug" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMP(3),
    CONSTRAINT "TourDemoLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TourDemoLink_token_key" ON "TourDemoLink"("token");
CREATE INDEX "TourDemoLink_tourSlug_idx" ON "TourDemoLink"("tourSlug");

CREATE TABLE "TourDemoEvent" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT,
    "value" INTEGER,
    "device" TEXT,
    "city" TEXT,
    "country" TEXT,
    "referrer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TourDemoEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TourDemoEvent_linkId_createdAt_idx" ON "TourDemoEvent"("linkId", "createdAt");
ALTER TABLE "TourDemoEvent" ADD CONSTRAINT "TourDemoEvent_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "TourDemoLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
