-- "Kreditér": a credit note made in Dinero from Arpo, kept on the invoice it credits.
ALTER TABLE "Invoice" ADD COLUMN "creditNoteGuid" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "creditNoteNumber" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "creditedAmount" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "creditReason" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "creditedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "creditedFull" BOOLEAN NOT NULL DEFAULT false;
