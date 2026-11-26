-- HR part 2: notice, start/stop checklists, clearing HR data 5 years after the employment ended.
ALTER TABLE "Employee" ADD COLUMN "noticeGivenAt" DATE;
ALTER TABLE "Employee" ADD COLUMN "noticeBy" TEXT;
ALTER TABLE "Employee" ADD COLUMN "anonymizedAt" TIMESTAMP(3);

CREATE TABLE "HrTask" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    CONSTRAINT "HrTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HrTask_employeeId_phase_idx" ON "HrTask"("employeeId", "phase");
ALTER TABLE "HrTask" ADD CONSTRAINT "HrTask_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Registered working time is kept 5 years (arbejdstidsloven) - counted from the end of the 4-month period the
-- 48-hour average is worked out over. Older than that it may (and should, GDPR) be deleted; newer never.
CREATE OR REPLACE FUNCTION hr_no_delete() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."date" < (CURRENT_DATE - INTERVAL '5 years 4 months') THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Registreret arbejdstid kan ikke slettes eller ændres før 5 år efter (arbejdstidsloven)';
END;
$$ LANGUAGE plpgsql;
