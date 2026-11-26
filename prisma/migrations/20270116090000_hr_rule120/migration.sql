-- The 120-days rule in the contract (funktionærloven § 5, stk. 2).
ALTER TABLE "Employee" ADD COLUMN "rule120" BOOLEAN NOT NULL DEFAULT false;
