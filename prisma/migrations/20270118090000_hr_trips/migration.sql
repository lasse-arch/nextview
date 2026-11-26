-- Kørepenge: the employee's trips in their own car for work (kørselsregnskab).
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "km" DOUBLE PRECISION NOT NULL,
    "dealId" TEXT,
    "status" "AbsenceStatus" NOT NULL DEFAULT 'REQUESTED',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Trip_employeeId_date_idx" ON "Trip"("employeeId", "date");
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
