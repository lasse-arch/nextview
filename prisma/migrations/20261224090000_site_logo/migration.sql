-- The customer's logo for the website's customer band, read from their tour.
CREATE TABLE "SiteLogo" (
    "dealId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "url" TEXT,
    "tone" TEXT,
    "hash" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SiteLogo_pkey" PRIMARY KEY ("dealId")
);
ALTER TABLE "SiteLogo" ADD CONSTRAINT "SiteLogo_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
