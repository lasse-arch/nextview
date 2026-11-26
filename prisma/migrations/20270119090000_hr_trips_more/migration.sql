-- Kørselsregnskab: home address and number plates on the employee, the kind of trip and the plate on each trip.
ALTER TABLE "Employee" ADD COLUMN "homeAddress" TEXT;
ALTER TABLE "Employee" ADD COLUMN "carPlates" TEXT;
ALTER TABLE "Trip" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'Andet';
ALTER TABLE "Trip" ADD COLUMN "plate" TEXT;
