-- Consolidate nanny location into the users table (single source of truth).
--
-- The users table already carries address + latitude + longitude (added in
-- 20260711220000_add_user_address_and_coordinates). nanny_profiles duplicated
-- latitude/longitude (from 20260420174513_add_booking_models) and a free-text
-- `location` label. This migration backfills anything still only on
-- nanny_profiles, then drops the duplicated columns.

-- 1. Backfill BEFORE dropping so no data is lost. Prefer any existing non-null
--    value already on the user row; only fall back to the nanny_profiles copy.
UPDATE "users" u
SET
  latitude  = COALESCE(u.latitude,  np.latitude),
  longitude = COALESCE(u.longitude, np.longitude),
  address   = COALESCE(u.address,   np.location)
FROM "nanny_profiles" np
WHERE np.user_id = u.id;

-- 2. Drop the now-duplicated location columns from nanny_profiles.
ALTER TABLE "nanny_profiles"
  DROP COLUMN "latitude",
  DROP COLUMN "longitude",
  DROP COLUMN "location";
