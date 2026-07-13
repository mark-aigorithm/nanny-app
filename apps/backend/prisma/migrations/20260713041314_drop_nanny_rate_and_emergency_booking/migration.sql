-- Per-nanny hourly rate removed: every booking now prices from the platform
-- standard hourly rate (app_settings.standard_hourly_rate), not a per-nanny rate.
ALTER TABLE "nanny_profiles" DROP COLUMN "hourly_rate";

-- Emergency booking flow removed: drop the EMERGENCY value from the
-- booking_type enum. Postgres cannot remove an enum value in place, so the type
-- is recreated. Any existing EMERGENCY rows are folded into STANDARD first so
-- the column cast cannot fail.
UPDATE "bookings" SET "type" = 'STANDARD' WHERE "type" = 'EMERGENCY';

ALTER TABLE "bookings" ALTER COLUMN "type" DROP DEFAULT;

CREATE TYPE "booking_type_new" AS ENUM ('STANDARD');
ALTER TABLE "bookings"
  ALTER COLUMN "type" TYPE "booking_type_new"
  USING ("type"::text::"booking_type_new");
ALTER TYPE "booking_type" RENAME TO "booking_type_old";
ALTER TYPE "booking_type_new" RENAME TO "booking_type";
DROP TYPE "booking_type_old";

ALTER TABLE "bookings" ALTER COLUMN "type" SET DEFAULT 'STANDARD';
