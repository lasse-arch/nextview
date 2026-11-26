-- When a filmer can work (their own "tilgængelighed" for the next ~3 months).
CREATE TABLE "FilmerAvailability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "fromMin" INTEGER NOT NULL,
    "toMin" INTEGER NOT NULL,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FilmerAvailability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FilmerAvailability_userId_date_key" ON "FilmerAvailability"("userId", "date");
CREATE INDEX "FilmerAvailability_date_idx" ON "FilmerAvailability"("date");

ALTER TABLE "FilmerAvailability" ADD CONSTRAINT "FilmerAvailability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
