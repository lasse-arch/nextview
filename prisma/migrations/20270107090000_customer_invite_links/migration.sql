-- "Invitationslink": customers' people add themselves to the customer page.
CREATE TABLE "CustomerInviteLink" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "role" "CustomerRole" NOT NULL DEFAULT 'STAFF',
    "canApprove" BOOLEAN NOT NULL DEFAULT false,
    "maxUses" INTEGER NOT NULL DEFAULT 5,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerInviteLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerInviteLink_tokenHash_key" ON "CustomerInviteLink"("tokenHash");
CREATE INDEX "CustomerInviteLink_dealId_idx" ON "CustomerInviteLink"("dealId");
ALTER TABLE "CustomerInviteLink" ADD CONSTRAINT "CustomerInviteLink_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerInviteLink" ADD CONSTRAINT "CustomerInviteLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
