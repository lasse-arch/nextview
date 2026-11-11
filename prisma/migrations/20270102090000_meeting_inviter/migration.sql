-- Who sent a deal's meeting invitation (whose Google calendar holds the event).
ALTER TABLE "Deal" ADD COLUMN "meetingInviterId" TEXT;
