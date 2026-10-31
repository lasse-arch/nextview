-- Visits counted from here (set when the tour is first published, or reset by hand) - the team's own views before are left out.
ALTER TABLE "Tour" ADD COLUMN "statsSince" TIMESTAMP(3);
