-- A showcase SMS can be sent again: the number and the text it was sent with are kept on its link.
ALTER TABLE "TourDemoLink" ADD COLUMN "smsTo" TEXT;
ALTER TABLE "TourDemoLink" ADD COLUMN "smsText" TEXT;
