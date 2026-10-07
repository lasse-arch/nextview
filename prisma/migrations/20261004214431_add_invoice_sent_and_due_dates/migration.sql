-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3);

-- Backfill for invoices already sent through Dinero. The exact send time
-- wasn't stored before, so the row's creation time (when the automatic run
-- drafted and sent it) stands in for it. Due date mirrors how the invoice
-- date is picked in invoice-service.ts: a recurring period's invoice is
-- dated 8 days before the period starts (so it falls due on the start date),
-- except a 1 January period, dated that day itself; an establishment fee is
-- dated when it was drafted. Netto 8 on top of that.
UPDATE "Invoice"
SET "sentAt" = CASE WHEN "failureReason" IS NULL THEN "createdAt" ELSE NULL END,
    "dueDate" = CASE
      WHEN "quarterIndex" = 0 THEN "createdAt" + INTERVAL '8 days'
      WHEN EXTRACT(MONTH FROM "scheduledDate") = 1 AND EXTRACT(DAY FROM "scheduledDate") = 1 THEN "scheduledDate" + INTERVAL '8 days'
      ELSE "scheduledDate"
    END
WHERE "status" = 'DRAFT_CREATED';
