-- DropForeignKey
ALTER TABLE "ContractRenewal" DROP CONSTRAINT "ContractRenewal_dealId_fkey";

-- DropTable
DROP TABLE "ContractRenewal";

-- AlterTable
ALTER TABLE "Deal" DROP COLUMN "contractLink",
ADD COLUMN "additionalTerms" TEXT,
ADD COLUMN "contractProducts" JSONB;
