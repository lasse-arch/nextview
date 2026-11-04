-- A second person who gets the tour review mails (and the customer page).
ALTER TABLE "Tour" ADD COLUMN "reviewEmail2" TEXT;
ALTER TABLE "Tour" ADD COLUMN "reviewName2" TEXT;
