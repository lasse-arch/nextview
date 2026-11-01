-- A tour given to a developer, with a deadline.
ALTER TABLE "Tour" ADD COLUMN "assignedToId" TEXT;
ALTER TABLE "Tour" ADD COLUMN "deadline" DATE;
CREATE INDEX "Tour_assignedToId_idx" ON "Tour"("assignedToId");
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
