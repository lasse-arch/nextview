-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Keep today's order (company-wide goals first, then oldest first) as the
-- starting point.
UPDATE "Goal" g
SET "sortOrder" = o.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "userId" NULLS FIRST, "createdAt") AS rn FROM "Goal"
) o
WHERE g.id = o.id;
