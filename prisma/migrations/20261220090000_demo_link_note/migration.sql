-- Who the showcase link went to, for our own use (e.g. "Skoleleder, Humlebakkeskolen") - never shown to the customer.
ALTER TABLE "TourDemoLink" ADD COLUMN "note" TEXT;
