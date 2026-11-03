-- The mail generator's sent mails: who to, whether they're opened (its tracking pixel) and the showcase links in them.
ALTER TABLE "SalesMail" ADD COLUMN "sentTo" TEXT;
ALTER TABLE "SalesMail" ADD COLUMN "sentCc" TEXT;
ALTER TABLE "SalesMail" ADD COLUMN "trackingId" TEXT;
ALTER TABLE "SalesMail" ADD COLUMN "openedAt" TIMESTAMP(3);
ALTER TABLE "SalesMail" ADD COLUMN "lastOpenedAt" TIMESTAMP(3);
ALTER TABLE "SalesMail" ADD COLUMN "openCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalesMail" ADD COLUMN "demoTokens" TEXT[] DEFAULT ARRAY[]::TEXT[];
CREATE UNIQUE INDEX "SalesMail_trackingId_key" ON "SalesMail"("trackingId");
