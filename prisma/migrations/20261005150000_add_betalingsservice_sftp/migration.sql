-- Idempotent: an earlier preview build may already have applied parts of this
-- to the production database under another name.
-- AlterTable
ALTER TABLE "BsDelivery" ADD COLUMN IF NOT EXISTS "sendViaSftp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "sftpError" TEXT,
ADD COLUMN IF NOT EXISTS "sftpSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "BsSettings" ADD COLUMN IF NOT EXISTS "autoSend" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "lastAutoDeliveryAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "relayIp" TEXT,
ADD COLUMN IF NOT EXISTS "relayLastError" TEXT,
ADD COLUMN IF NOT EXISTS "relayLastSeenAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "relayPublicKey" TEXT,
ADD COLUMN IF NOT EXISTS "relayTokenHash" TEXT,
ADD COLUMN IF NOT EXISTS "sftpDownloadDir" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "sftpHost" TEXT,
ADD COLUMN IF NOT EXISTS "sftpPort" INTEGER NOT NULL DEFAULT 22,
ADD COLUMN IF NOT EXISTS "sftpUploadDir" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "sftpUser" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "BsMailboxFile" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BsMailboxFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BsMailboxFile_contentHash_key" ON "BsMailboxFile"("contentHash");

