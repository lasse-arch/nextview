-- The employment contract: the duties (§ 3) and the DocuSeal submission it was sent as.
ALTER TABLE "Employee" ADD COLUMN "duties" TEXT;
ALTER TABLE "Employee" ADD COLUMN "contractSubmissionId" TEXT;
ALTER TABLE "Employee" ADD COLUMN "contractSentAt" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN "contractViewedAt" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN "contractSignedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Employee_contractSubmissionId_key" ON "Employee"("contractSubmissionId");
