-- The seller closed the "Husk faktura for din provisionsperiode" card for this period (its start, ISO) - it comes back next period.
ALTER TABLE "User" ADD COLUMN "commissionReminderHiddenFor" TEXT;
