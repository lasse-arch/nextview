-- CreateEnum
CREATE TYPE "GoalPeriod" AS ENUM ('MONTH', 'QUARTER', 'REST_OF_YEAR', 'YEAR');

-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "period" "GoalPeriod" NOT NULL DEFAULT 'MONTH';
