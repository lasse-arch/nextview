-- AlterTable: EmailMessage tracking fields
ALTER TABLE "EmailMessage" ADD COLUMN "trackingId" TEXT;
ALTER TABLE "EmailMessage" ADD COLUMN "openedAt" TIMESTAMP(3);
ALTER TABLE "EmailMessage" ADD COLUMN "openCount" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "EmailMessage_trackingId_key" ON "EmailMessage"("trackingId");

-- CreateTable: EmailTemplate
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: LeadCandidate.sourceUrl
ALTER TABLE "LeadCandidate" ADD COLUMN "sourceUrl" TEXT;

-- CreateTable: WatchedUrl
CREATE TABLE "WatchedUrl" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastScannedAt" TIMESTAMP(3),
    "lastContentHash" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchedUrl_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "WatchedUrl" ADD CONSTRAINT "WatchedUrl_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
