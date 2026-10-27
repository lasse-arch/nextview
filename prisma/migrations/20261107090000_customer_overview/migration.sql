-- Customer overview: logins and the mails the system sends by itself.
ALTER TABLE "CustomerAccount" ADD COLUMN "lastSeenAt" TIMESTAMP(3);

CREATE TABLE "CustomerLogin" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerLogin_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerLogin_accountId_at_idx" ON "CustomerLogin"("accountId", "at");
ALTER TABLE "CustomerLogin" ADD CONSTRAINT "CustomerLogin_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SystemMail" (
    "id" TEXT NOT NULL,
    "dealId" TEXT,
    "accountId" TEXT,
    "kind" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "error" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SystemMail_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SystemMail_dealId_sentAt_idx" ON "SystemMail"("dealId", "sentAt");
CREATE INDEX "SystemMail_accountId_sentAt_idx" ON "SystemMail"("accountId", "sentAt");
ALTER TABLE "SystemMail" ADD CONSTRAINT "SystemMail_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SystemMail" ADD CONSTRAINT "SystemMail_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
