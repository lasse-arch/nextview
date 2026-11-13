-- Who sent the deal's contract: "Send kontraktmailen igen" sends again from their Gmail, whoever presses it.
ALTER TABLE "Deal" ADD COLUMN "contractSentById" TEXT;
