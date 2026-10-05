-- AlterTable
ALTER TABLE "BsDelivery" ADD COLUMN     "sendViaSftp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sftpError" TEXT,
ADD COLUMN     "sftpSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "BsSettings" ADD COLUMN     "autoSend" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastAutoDeliveryAt" TIMESTAMP(3),
ADD COLUMN     "relayIp" TEXT,
ADD COLUMN     "relayLastError" TEXT,
ADD COLUMN     "relayLastSeenAt" TIMESTAMP(3),
ADD COLUMN     "relayPublicKey" TEXT,
ADD COLUMN     "relayTokenHash" TEXT,
ADD COLUMN     "sftpDownloadDir" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sftpHost" TEXT,
ADD COLUMN     "sftpPort" INTEGER NOT NULL DEFAULT 22,
ADD COLUMN     "sftpUploadDir" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sftpUser" TEXT;

-- CreateTable
CREATE TABLE "BsMailboxFile" (
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
CREATE UNIQUE INDEX "BsMailboxFile_contentHash_key" ON "BsMailboxFile"("contentHash");

