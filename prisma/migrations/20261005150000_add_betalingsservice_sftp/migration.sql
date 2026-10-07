-- Idempotent: an earlier preview build may already have applied parts of this
-- to the production database under another name.
-- AlterTable
ALTER TABLE "BsDelivery" ADD COLUMN IF NOT EXISTS "sendViaSftp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "sftpError" TEXT,
ADD COLUMN IF NOT EXISTS "sftpSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "BsSettings" ADD COLUMN IF NOT EXISTS "autoSend" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "lastAutoDeliveryAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "sftpHost" TEXT,
ADD COLUMN IF NOT EXISTS "sftpPort" INTEGER NOT NULL DEFAULT 10022,
ADD COLUMN IF NOT EXISTS "sftpUser" TEXT,
ADD COLUMN IF NOT EXISTS "sftpPrivateKeyEnc" TEXT,
ADD COLUMN IF NOT EXISTS "sftpPassphraseEnc" TEXT,
ADD COLUMN IF NOT EXISTS "sftpPublicKey" TEXT,
ADD COLUMN IF NOT EXISTS "sftpKeyCreatedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "sftpLastRunAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "sftpLastError" TEXT;

-- Columns from an earlier relay-server design that an old preview build may
-- have created in production - no longer used.
ALTER TABLE "BsSettings" DROP COLUMN IF EXISTS "relayTokenHash",
DROP COLUMN IF EXISTS "relayPublicKey",
DROP COLUMN IF EXISTS "relayIp",
DROP COLUMN IF EXISTS "relayLastSeenAt",
DROP COLUMN IF EXISTS "relayLastError",
DROP COLUMN IF EXISTS "sftpUploadDir",
DROP COLUMN IF EXISTS "sftpDownloadDir";

-- My File Transfer listens on port 10022 (an earlier version defaulted to 22).
ALTER TABLE "BsSettings" ALTER COLUMN "sftpPort" SET DEFAULT 10022;
UPDATE "BsSettings" SET "sftpPort" = 10022 WHERE "sftpPort" = 22;

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

