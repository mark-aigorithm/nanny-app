-- Mark past CONFIRMED / IN_PROGRESS bookings as COMPLETED.
-- Run against your dev DB, e.g.:
--   psql "$DATABASE_URL" -f apps/backend/prisma/scripts/complete-past-bookings.sql

BEGIN;

-- Preview rows that will be updated
SELECT id, status, start_time, end_time
FROM bookings
WHERE deleted_at IS NULL
  AND status IN ('CONFIRMED', 'IN_PROGRESS')
  AND end_time < NOW()
ORDER BY end_time;

UPDATE bookings
SET
  status = 'COMPLETED',
  nanny_checked_in_at = CASE
    WHEN status = 'CONFIRMED' AND nanny_checked_in_at IS NULL THEN start_time
    ELSE nanny_checked_in_at
  END,
  nanny_checked_out_at = COALESCE(nanny_checked_out_at, end_time),
  updated_at = NOW()
WHERE deleted_at IS NULL
  AND status IN ('CONFIRMED', 'IN_PROGRESS')
  AND end_time < NOW();

COMMIT;
