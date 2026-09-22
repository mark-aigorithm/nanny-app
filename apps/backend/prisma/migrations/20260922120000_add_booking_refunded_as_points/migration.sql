-- Records an overpayment that was settled as Care Points rather than refunded
-- to the card. Netted out of what the mother has effectively paid, the same way
-- payments.refunded_amount is, so the refund guard and the booking editor both
-- stop double-counting money she has already had back.
--
-- Additive and defaulted: every existing booking reads as "nothing settled as
-- points", which is what they are.

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "refunded_as_points_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "refunded_as_points_at" TIMESTAMP(3);
