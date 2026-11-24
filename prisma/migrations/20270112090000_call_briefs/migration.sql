-- Generator → "Første opkald": every call card written is kept - who made it, when, for which site.
CREATE TABLE "CallBrief" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sources" JSONB NOT NULL,
    "dealId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CallBrief_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CallBrief_userId_createdAt_idx" ON "CallBrief"("userId", "createdAt");
CREATE INDEX "CallBrief_createdAt_idx" ON "CallBrief"("createdAt");
ALTER TABLE "CallBrief" ADD CONSTRAINT "CallBrief_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallBrief" ADD CONSTRAINT "CallBrief_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
