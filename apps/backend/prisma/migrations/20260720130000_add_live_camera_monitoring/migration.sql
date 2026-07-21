-- Live camera monitoring: parents watch the feed of the camera assigned to
-- their booking's nanny while the booking is IN_PROGRESS.
--
-- No booking->camera column: a booking resolves to a feed through its nanny
-- (cameras.nanny_user_id), so reassigning a booking follows the new nanny.

-- Cooldown timestamp for the parent's "ask the nanny to turn on the camera"
-- nudge. Nullable = never asked.
ALTER TABLE "bookings" ADD COLUMN "camera_notified_at" TIMESTAMP(3);

-- New notification kind for that nudge.
ALTER TYPE "notification_type" ADD VALUE 'CAMERA_REQUESTED';
