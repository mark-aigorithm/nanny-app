-- Surveys no longer have a description: the title is all a mother sees above
-- the questions. Apply after the backend that stops reading the column is live.
ALTER TABLE "surveys" DROP COLUMN "description";
