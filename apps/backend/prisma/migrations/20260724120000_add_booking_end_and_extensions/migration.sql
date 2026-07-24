-- Hand-authored: no local database is available in this environment, so this was
-- written by hand and each identifier matched against the names Prisma generates
-- for the same schema (see the sibling migrations for the same convention).

-- 1. Mother-initiated end of a running shift.
-- Deliberately NOT nanny_checked_out_at: that column means "the nanny checked
-- herself out", and reusing it would misreport who actually closed the shift.
-- A booking completed this way has mother_ended_at set and the check-out null.
ALTER TABLE "bookings" ADD COLUMN "mother_ended_at" TIMESTAMP(3);

-- 2. New notification types for the end / extend lifecycle.
ALTER TYPE "notification_type" ADD VALUE 'BOOKING_ENDED_BY_PARENT';
ALTER TYPE "notification_type" ADD VALUE 'BOOKING_EXTENSION_REQUESTED';
ALTER TYPE "notification_type" ADD VALUE 'BOOKING_EXTENSION_ACCEPTED';
ALTER TYPE "notification_type" ADD VALUE 'BOOKING_EXTENSION_DECLINED';
ALTER TYPE "notification_type" ADD VALUE 'BOOKING_EXTENDED';

-- 3. A third thing a payment can be for.
ALTER TYPE "payment_purpose" ADD VALUE 'BOOKING_EXTENSION';

-- 4. Extension lifecycle.
CREATE TYPE "booking_extension_status" AS ENUM ('PENDING_NANNY', 'ACCEPTED', 'PAID', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- 5. The extension request itself. Every money column is a snapshot taken when
-- the mother asked, so later changes to platform rates cannot retroactively
-- re-price hours she already agreed to. Credits (package hours / Care Points)
-- are reserved on the nanny's acceptance and returned unless the row reaches
-- PAID -- see booking-extension.service.
CREATE TABLE "booking_extensions" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "mother_id" INTEGER NOT NULL,
    "status" "booking_extension_status" NOT NULL DEFAULT 'PENDING_NANNY',
    "hours" DECIMAL(4,2) NOT NULL,
    "new_end_time" TIMESTAMP(3) NOT NULL,
    "hourly_rate" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "package_hours_applied" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "package_skills_covered" INTEGER NOT NULL DEFAULT 0,
    "package_credit_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "reward_credit_hours_applied" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "reward_credit_points" INTEGER NOT NULL DEFAULT 0,
    "reward_credit_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "nanny_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "platform_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nanny_responded_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "booking_extensions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "booking_extensions_booking_id_idx" ON "booking_extensions"("booking_id");

CREATE INDEX "booking_extensions_mother_id_idx" ON "booking_extensions"("mother_id");

-- Drives the expiry sweep, which scans for open rows already past their deadline.
CREATE INDEX "booking_extensions_status_expires_at_idx" ON "booking_extensions"("status", "expires_at");

ALTER TABLE "booking_extensions" ADD CONSTRAINT "booking_extensions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "booking_extensions" ADD CONSTRAINT "booking_extensions_mother_id_fkey" FOREIGN KEY ("mother_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Payments gain a third polymorphic owner. Non-unique for the same reason
-- booking_id and package_purchase_id are: one row per payment ATTEMPT.
ALTER TABLE "payments" ADD COLUMN "booking_extension_id" INTEGER;

CREATE INDEX "payments_booking_extension_id_idx" ON "payments"("booking_extension_id");

ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_extension_id_fkey" FOREIGN KEY ("booking_extension_id") REFERENCES "booking_extensions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. Package-hour movements can now be scoped to an extension instead of a
-- booking. The extra unique key is what keeps extension refunds idempotent:
-- the existing (booking_id, purchase_id, type) key cannot help, because these
-- rows carry a null booking_id and Postgres treats NULLs as distinct.
ALTER TABLE "package_hours_ledger_entries" ADD COLUMN "booking_extension_id" INTEGER;

CREATE INDEX "package_hours_ledger_entries_booking_extension_id_idx" ON "package_hours_ledger_entries"("booking_extension_id");

CREATE UNIQUE INDEX "package_hours_ledger_entries_extension_purchase_type_key" ON "package_hours_ledger_entries"("booking_extension_id", "purchase_id", "type");

ALTER TABLE "package_hours_ledger_entries" ADD CONSTRAINT "package_hours_ledger_entries_booking_extension_id_fkey" FOREIGN KEY ("booking_extension_id") REFERENCES "booking_extensions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 8. Care Points movements get the same scoping, so an extension's REDEEM is
-- distinguishable from the parent booking's own. No unique key here: this
-- ledger has never had one -- idempotency is a pre-read guard in reward.service.
ALTER TABLE "reward_ledger_entries" ADD COLUMN "booking_extension_id" INTEGER;

CREATE INDEX "reward_ledger_entries_booking_extension_id_idx" ON "reward_ledger_entries"("booking_extension_id");
