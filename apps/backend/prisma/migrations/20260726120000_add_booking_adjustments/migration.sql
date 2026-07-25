-- Hand-authored: no local database is available in this environment, so this was
-- written by hand and each identifier matched against the names Prisma generates
-- for the same schema (see the sibling migrations for the same convention).

-- 1. New notification types for the admin edit / refund / balance-due lifecycle.
ALTER TYPE "notification_type" ADD VALUE 'BOOKING_EDITED';
ALTER TYPE "notification_type" ADD VALUE 'BOOKING_REFUNDED';
ALTER TYPE "notification_type" ADD VALUE 'BOOKING_BALANCE_DUE';

-- 2. A fourth thing a payment can be for: the mother paying the difference after
-- an admin edit raised the total of an already-paid booking.
ALTER TYPE "payment_purpose" ADD VALUE 'BOOKING_ADJUSTMENT';

-- 3. Adjustment lifecycle.
CREATE TYPE "booking_adjustment_status" AS ENUM ('PENDING_PAYMENT', 'PAID', 'CANCELLED');

-- 4. The "pay the difference" obligation itself. amount_egp is the positive delta
-- the mother owes. Unlike an extension it moves no hours: the booking snapshot was
-- already re-priced by the edit; this row only settles money.
CREATE TABLE "booking_adjustments" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "mother_id" INTEGER NOT NULL,
    "status" "booking_adjustment_status" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "amount_egp" DECIMAL(10,2) NOT NULL,
    "reason" TEXT,
    "created_by_id" INTEGER,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "booking_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "booking_adjustments_booking_id_idx" ON "booking_adjustments"("booking_id");

CREATE INDEX "booking_adjustments_mother_id_idx" ON "booking_adjustments"("mother_id");

CREATE INDEX "booking_adjustments_status_idx" ON "booking_adjustments"("status");

ALTER TABLE "booking_adjustments" ADD CONSTRAINT "booking_adjustments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "booking_adjustments" ADD CONSTRAINT "booking_adjustments_mother_id_fkey" FOREIGN KEY ("mother_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "booking_adjustments" ADD CONSTRAINT "booking_adjustments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Payments gain a fourth polymorphic owner. Non-unique for the same reason
-- the other owner ids are: one row per payment ATTEMPT.
ALTER TABLE "payments" ADD COLUMN "booking_adjustment_id" INTEGER;

CREATE INDEX "payments_booking_adjustment_id_idx" ON "payments"("booking_adjustment_id");

ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_adjustment_id_fkey" FOREIGN KEY ("booking_adjustment_id") REFERENCES "booking_adjustments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
