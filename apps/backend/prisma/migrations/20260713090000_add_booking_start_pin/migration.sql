-- AlterTable
-- Parent-generated hand-off PIN gating nanny check-in (stored hashed, cleared on check-in).
ALTER TABLE "bookings" ADD COLUMN     "start_pin_hash" TEXT,
ADD COLUMN     "start_pin_generated_at" TIMESTAMP(3),
ADD COLUMN     "start_pin_expires_at" TIMESTAMP(3),
ADD COLUMN     "start_pin_attempts" INTEGER NOT NULL DEFAULT 0;
