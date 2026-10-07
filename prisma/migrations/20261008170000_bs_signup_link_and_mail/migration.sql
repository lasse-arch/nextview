-- AlterTable
ALTER TABLE "BsSettings" ADD COLUMN IF NOT EXISTS "signupLink" TEXT;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "bsSignupMailSentAt" TIMESTAMP(3);
