-- Package purchases + hours redemption: parents buy an hour "bucket" (a
-- PackagePurchase snapshotting the Package catalog row at purchase time),
-- pay for it via the existing Payment model (now polymorphic — a payment
-- settles either a Booking or a PackagePurchase, never both), and draw the
-- bucket down via PackageHoursLedger as bookings redeem hours. Mirrors the
-- RewardWallet/RewardLedgerEntry ledger pattern already used for Care Points.
--
-- NOTE: hand-written (no local DB in this environment to run
-- `prisma migrate dev` against) — applied via `prisma migrate deploy` in CI/
-- staging/production like any other migration. Verified against the Prisma
-- schema diff by hand; non-destructive throughout (see below).

-- CreateEnum
CREATE TYPE "package_purchase_status" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "package_hours_entry_type" AS ENUM ('PURCHASE', 'REDEMPTION', 'REFUND', 'EXPIRY', 'ADMIN_ADJUST');

-- CreateEnum
CREATE TYPE "payment_purpose" AS ENUM ('BOOKING', 'PACKAGE');

-- AlterTable
-- max_skills is safe as a plain NOT NULL DEFAULT add. validity_days has no
-- application-level default, so it's added nullable, backfilled for any
-- rows an admin already created (30 days, a reasonable catalog default they
-- can revise), then locked to NOT NULL — no data loss, no failed deploy if
-- rows already exist.
ALTER TABLE "packages" ADD COLUMN     "validity_days" INTEGER,
ADD COLUMN     "max_skills" INTEGER NOT NULL DEFAULT 0;

UPDATE "packages" SET "validity_days" = 30 WHERE "validity_days" IS NULL;

ALTER TABLE "packages" ALTER COLUMN "validity_days" SET NOT NULL;

-- AlterTable
-- Package hours ("bucket") redeemed against a booking before payment, mirroring
-- the existing reward_credit_* snapshot columns. All additive, zero-default —
-- no backfill needed.
ALTER TABLE "bookings" ADD COLUMN     "package_hours_applied" DECIMAL(6,2) NOT NULL DEFAULT 0,
ADD COLUMN     "package_skills_covered" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "package_credit_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- DropForeignKey
-- booking_id's FK was created when the column was required, so Prisma's
-- default referential action for it is ON DELETE RESTRICT. Now that the
-- relation is optional, Prisma's default for an optional relation is
-- ON DELETE SET NULL — recreated below, alongside the other new FKs, to
-- match what `prisma migrate dev` would generate for this schema (verified
-- via `prisma migrate diff --from-schema/--to-schema`, which needs no DB).
ALTER TABLE "payments" DROP CONSTRAINT "payments_booking_id_fkey";

-- AlterTable
-- Make Payment polymorphic: booking_id becomes optional (a payment may
-- instead settle a package_purchase_id), and `purpose` disambiguates which
-- relation is populated. Existing rows keep their booking_id and backfill
-- to purpose = 'BOOKING' via the column default — non-destructive.
ALTER TABLE "payments" ALTER COLUMN "booking_id" DROP NOT NULL;
ALTER TABLE "payments" ADD COLUMN     "package_purchase_id" INTEGER,
ADD COLUMN     "purpose" "payment_purpose" NOT NULL DEFAULT 'BOOKING';

-- CreateTable
CREATE TABLE "package_purchases" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "package_id" INTEGER NOT NULL,
    "name_snapshot" TEXT NOT NULL,
    "hours_purchased" INTEGER NOT NULL,
    "price_paid" DECIMAL(10,2) NOT NULL,
    "max_skills_snapshot" INTEGER NOT NULL,
    "hours_remaining" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "status" "package_purchase_status" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "purchased_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "package_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_hours_ledger" (
    "id" SERIAL NOT NULL,
    "purchase_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" "package_hours_entry_type" NOT NULL,
    "hours" DECIMAL(6,2) NOT NULL,
    "balance_after" DECIMAL(6,2) NOT NULL,
    "reason" TEXT,
    "booking_id" INTEGER,
    "admin_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "package_hours_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "package_purchases_user_id_status_idx" ON "package_purchases"("user_id", "status");

-- CreateIndex
CREATE INDEX "package_purchases_expires_at_idx" ON "package_purchases"("expires_at");

-- CreateIndex
CREATE INDEX "package_purchases_deleted_at_idx" ON "package_purchases"("deleted_at");

-- CreateIndex
CREATE INDEX "package_hours_ledger_user_id_created_at_idx" ON "package_hours_ledger"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "package_hours_ledger_purchase_id_idx" ON "package_hours_ledger"("purchase_id");

-- CreateIndex
CREATE INDEX "package_hours_ledger_booking_id_idx" ON "package_hours_ledger"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_package_purchase_id_key" ON "payments"("package_purchase_id");

-- AddForeignKey
ALTER TABLE "package_purchases" ADD CONSTRAINT "package_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_purchases" ADD CONSTRAINT "package_purchases_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_hours_ledger" ADD CONSTRAINT "package_hours_ledger_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "package_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_hours_ledger" ADD CONSTRAINT "package_hours_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_hours_ledger" ADD CONSTRAINT "package_hours_ledger_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_hours_ledger" ADD CONSTRAINT "package_hours_ledger_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_package_purchase_id_fkey" FOREIGN KEY ("package_purchase_id") REFERENCES "package_purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
