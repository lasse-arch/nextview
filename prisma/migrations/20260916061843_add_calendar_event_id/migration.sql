-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "googleCalendarEventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Deal_googleCalendarEventId_key" ON "Deal"("googleCalendarEventId");

