-- Customer users and roles: owners on /kunde can invite their own people.
CREATE TYPE "CustomerRole" AS ENUM ('OWNER', 'STAFF', 'DEVELOPER', 'VIEWER');

ALTER TABLE "CustomerAccountDeal" ADD COLUMN "role" "CustomerRole" NOT NULL DEFAULT 'OWNER';
ALTER TABLE "CustomerAccountDeal" ADD COLUMN "canApprove" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomerAccountDeal" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "CustomerAccountDeal" ADD COLUMN "invitedById" TEXT;

ALTER TABLE "Deal" ADD COLUMN "customersMayInvite" BOOLEAN NOT NULL DEFAULT true;
