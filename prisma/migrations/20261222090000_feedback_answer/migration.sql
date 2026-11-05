-- What the team (or nextviewAI) did about a correction.
ALTER TABLE "TourFeedback" ADD COLUMN "answer" TEXT;
ALTER TABLE "TourFeedback" ADD COLUMN "answerBy" TEXT;
ALTER TABLE "TourFeedback" ADD COLUMN "answeredAt" TIMESTAMP(3);
