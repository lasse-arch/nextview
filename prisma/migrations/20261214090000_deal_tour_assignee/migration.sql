-- A customer's tour given to a developer (with a deadline) before the tour exists.
ALTER TABLE "Deal" ADD COLUMN "tourAssigneeId" TEXT;
ALTER TABLE "Deal" ADD COLUMN "tourDeadline" DATE;
CREATE INDEX "Deal_tourAssigneeId_idx" ON "Deal"("tourAssigneeId");
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_tourAssigneeId_fkey" FOREIGN KEY ("tourAssigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
