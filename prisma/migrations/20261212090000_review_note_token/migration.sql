-- A review link that can only write notes, never approve the tour.
ALTER TABLE "Tour" ADD COLUMN "reviewNoteToken" TEXT;
CREATE UNIQUE INDEX "Tour_reviewNoteToken_key" ON "Tour"("reviewNoteToken");
