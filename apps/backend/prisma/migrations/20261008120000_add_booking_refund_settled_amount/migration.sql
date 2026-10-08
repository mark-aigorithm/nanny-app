-- EGP of a refund the console settled as Care Points rather than to the card.
-- Additive with a default, so existing rows read as "nothing settled".
ALTER TABLE "bookings" ADD COLUMN "refund_settled_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;
