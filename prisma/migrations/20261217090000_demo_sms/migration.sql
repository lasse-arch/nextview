-- The showcase SMS: tours the sellers may send to new customers, and which deal a showcase link was sent to.
ALTER TABLE "Tour" ADD COLUMN "showcase" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TourDemoLink" ADD COLUMN "dealId" TEXT;
CREATE INDEX "TourDemoLink_dealId_idx" ON "TourDemoLink"("dealId");
ALTER TABLE "TourDemoLink" ADD CONSTRAINT "TourDemoLink_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
