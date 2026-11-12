-- The team's own networks (a keyed hash of the address only): tour visits from them aren't counted.
CREATE TABLE "TeamNetwork" (
    "hash" TEXT NOT NULL,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamNetwork_pkey" PRIMARY KEY ("hash")
);
CREATE INDEX "TeamNetwork_lastSeen_idx" ON "TeamNetwork"("lastSeen");
