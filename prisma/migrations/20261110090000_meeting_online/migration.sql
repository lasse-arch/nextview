-- A booked meeting can be online (Google Meet in the invitation) - off by default.
ALTER TABLE "Deal" ADD COLUMN "meetingOnline" BOOLEAN NOT NULL DEFAULT false;
