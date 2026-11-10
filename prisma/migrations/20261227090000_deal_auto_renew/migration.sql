-- The contract renews itself after the binding period (true, as before) - or ends there (false).
ALTER TABLE "Deal" ADD COLUMN "autoRenew" BOOLEAN NOT NULL DEFAULT true;
