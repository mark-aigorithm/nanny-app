-- First half of a two-release move: the start PIN is stored in the clear so the
-- admin console can read it back during a hand-off. "start_pin_hash" is no
-- longer read or written from this release on and is dropped in the next one.

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "start_pin" TEXT;
