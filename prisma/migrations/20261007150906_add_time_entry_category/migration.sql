-- CreateEnum
CREATE TYPE "TimeEntryCategory" AS ENUM ('FILMING', 'TOUR_EDITING', 'REFILMING', 'CORRECTIONS');

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "category" "TimeEntryCategory";
