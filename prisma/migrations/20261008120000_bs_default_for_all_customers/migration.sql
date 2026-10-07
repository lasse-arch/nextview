-- New customers pay via Betalingsservice by default.
ALTER TABLE "Deal" ALTER COLUMN "paymentMethod" SET DEFAULT 'BETALINGSSERVICE';

-- AlterTable
ALTER TABLE "BsSettings" ADD COLUMN IF NOT EXISTS "allCustomersSwitchedAt" TIMESTAMP(3);
