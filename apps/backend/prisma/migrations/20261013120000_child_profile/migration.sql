-- Profile → Children: a child gets a birth month instead of an age, chip lists
-- for allergies/conditions/diet/interests/languages, and two free-text notes.

-- Old rows keep their stored age; new rows store a birth month instead.
ALTER TABLE "children" ALTER COLUMN "age_years" DROP NOT NULL;
ALTER TABLE "children" ADD COLUMN "birth_date" DATE;

-- Allergies were one free-text line. Keep each old answer, unchanged, as a
-- single chip rather than guessing how to split "peanuts, and cats make her wheeze".
ALTER TABLE "children" ALTER COLUMN "allergies" TYPE TEXT[] USING (
  CASE
    WHEN "allergies" IS NULL OR btrim("allergies") = '' THEN ARRAY[]::TEXT[]
    ELSE ARRAY[btrim("allergies")]
  END
);
ALTER TABLE "children" ALTER COLUMN "allergies" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "children" ALTER COLUMN "allergies" SET NOT NULL;

ALTER TABLE "children" ADD COLUMN "conditions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "children" ADD COLUMN "health_notes" TEXT;
ALTER TABLE "children" ADD COLUMN "diet" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "children" ADD COLUMN "interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "children" ADD COLUMN "languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "children" ADD COLUMN "notes" TEXT;
