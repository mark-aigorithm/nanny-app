-- Which children a care log entry is about. Additive with a default, so the
-- deployed backend keeps working until the new code is live.
ALTER TABLE "care_logs" ADD COLUMN "child_names" TEXT[] DEFAULT ARRAY[]::TEXT[];
