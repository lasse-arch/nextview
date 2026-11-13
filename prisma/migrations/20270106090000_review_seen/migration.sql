-- Has the customer looked at the tour sent for review: first and last visit on the review link, and how many visits.
ALTER TABLE "Tour" ADD COLUMN "reviewFirstSeenAt" TIMESTAMP(3);
ALTER TABLE "Tour" ADD COLUMN "reviewLastSeenAt" TIMESTAMP(3);
ALTER TABLE "Tour" ADD COLUMN "reviewSeen" INTEGER NOT NULL DEFAULT 0;
