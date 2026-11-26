-- HR: employees, pay terms (with history), registered working time, absence, access log.
ALTER TYPE "Role" ADD VALUE 'EMPLOYEE';

CREATE TYPE "EmploymentKind" AS ENUM ('SALARIED', 'HOURLY', 'TRAINEE', 'FREELANCE');
CREATE TYPE "PayModel" AS ENUM ('MONTHLY', 'HOURLY', 'MONTHLY_COMMISSION', 'COMMISSION_ONLY', 'INVOICE');
CREATE TYPE "AbsenceKind" AS ENUM ('VACATION', 'SICK', 'CHILD_SICK', 'LEAVE', 'TIME_OFF', 'UNPAID');
CREATE TYPE "AbsenceStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "EmploymentKind" NOT NULL,
    "title" TEXT NOT NULL,
    "managerId" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "probationEnd" DATE,
    "weeklyMinutes" INTEGER NOT NULL DEFAULT 2220,
    "workDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "payrollNumber" TEXT,
    "vacationCarryDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vacationCarryFrom" DATE,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PayTerms" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "model" "PayModel" NOT NULL,
    "monthlyOre" INTEGER,
    "hourlyOre" INTEGER,
    "commissionPct" DOUBLE PRECISION,
    "pensionEmployeePct" DOUBLE PRECISION,
    "pensionEmployerPct" DOUBLE PRECISION,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayTerms_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PayTerms_employeeId_effectiveFrom_idx" ON "PayTerms"("employeeId", "effectiveFrom");
ALTER TABLE "PayTerms" ADD CONSTRAINT "PayTerms_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "WorkDay" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" TEXT,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkDay_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkDay_employeeId_date_key" ON "WorkDay"("employeeId", "date");
ALTER TABLE "WorkDay" ADD CONSTRAINT "WorkDay_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "WorkDayChange" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "oldMinutes" INTEGER,
    "newMinutes" INTEGER NOT NULL,
    "byId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkDayChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkDayChange_employeeId_date_idx" ON "WorkDayChange"("employeeId", "date");
ALTER TABLE "WorkDayChange" ADD CONSTRAINT "WorkDayChange_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "WorkWeek" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    CONSTRAINT "WorkWeek_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkWeek_employeeId_weekStart_key" ON "WorkWeek"("employeeId", "weekStart");
ALTER TABLE "WorkWeek" ADD CONSTRAINT "WorkWeek_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Absence" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "AbsenceKind" NOT NULL,
    "from" DATE NOT NULL,
    "to" DATE NOT NULL,
    "halfDay" BOOLEAN NOT NULL DEFAULT false,
    "status" "AbsenceStatus" NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT,
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Absence_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Absence_employeeId_from_idx" ON "Absence"("employeeId", "from");
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "HrAccessLog" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "what" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HrAccessLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HrAccessLog_employeeId_at_idx" ON "HrAccessLog"("employeeId", "at");

-- The registered working time and its log are evidence (arbejdstidsloven, 5 years): never deleted.
CREATE OR REPLACE FUNCTION hr_no_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Registreret arbejdstid kan ikke slettes (arbejdstidsloven: 5 år)';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "WorkDay_no_delete" BEFORE DELETE ON "WorkDay" FOR EACH ROW EXECUTE FUNCTION hr_no_delete();
CREATE TRIGGER "WorkDayChange_no_change" BEFORE DELETE OR UPDATE ON "WorkDayChange" FOR EACH ROW EXECUTE FUNCTION hr_no_delete();
