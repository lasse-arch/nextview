-- "Særlige vilkår" in an employee's contract (a guaranteed minimum pay, or another agreed term), from a date.
CREATE TABLE "ContractTerm" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT,
    "text" TEXT,
    "amountOre" INTEGER,
    "from" DATE NOT NULL,
    "to" DATE,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractTerm_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContractTerm_employeeId_idx" ON "ContractTerm"("employeeId");

ALTER TABLE "ContractTerm" ADD CONSTRAINT "ContractTerm_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
