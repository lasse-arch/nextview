-- CreateTable
CREATE TABLE "EmailRecipientOpen" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "gmailMessageId" TEXT NOT NULL,
    "trackingId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3),
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "openTimestamps" TIMESTAMP(3)[] DEFAULT ARRAY[]::TIMESTAMP(3)[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailRecipientOpen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailRecipientOpen_trackingId_key" ON "EmailRecipientOpen"("trackingId");

-- CreateIndex
CREATE INDEX "EmailRecipientOpen_messageId_idx" ON "EmailRecipientOpen"("messageId");

-- AddForeignKey
ALTER TABLE "EmailRecipientOpen" ADD CONSTRAINT "EmailRecipientOpen_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
