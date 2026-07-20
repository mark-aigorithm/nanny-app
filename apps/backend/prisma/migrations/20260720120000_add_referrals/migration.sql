-- Referral rewards: parents share a personal code, the invitee is credited Care
-- Points on redeeming it, and the referrer is credited once that invitee's first
-- booking completes. Payout amounts live on the existing reward_config singleton
-- so admins manage earning, redemption and referrals in one place.
-- Ordered AFTER 20260717120000_convert_cuid_pks_to_int, so all ids and the FKs to
-- users are sequential integers, consistent with the rest of the schema.

-- AlterEnum
-- Both sides of a referral payout share one ledger type; the entry's `reason`
-- distinguishes the invitee's welcome grant from the referrer's bonus.
ALTER TYPE "reward_entry_type" ADD VALUE 'REFERRAL';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "notification_type" ADD VALUE 'REFERRAL_CONVERTED';
ALTER TYPE "notification_type" ADD VALUE 'REFERRAL_JOINED';

-- CreateEnum
CREATE TYPE "referral_status" AS ENUM ('PENDING', 'CONVERTED');

-- AlterTable
ALTER TABLE "reward_config" ADD COLUMN     "referral_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "referrer_points" INTEGER NOT NULL DEFAULT 200,
ADD COLUMN     "referee_points" INTEGER NOT NULL DEFAULT 100;

-- AlterTable
-- Nullable with no backfill: codes are generated lazily on first request, so
-- existing users are unaffected until they open the refer screen.
ALTER TABLE "users" ADD COLUMN     "referral_code" TEXT;

-- CreateTable
CREATE TABLE "referrals" (
    "id" SERIAL NOT NULL,
    "referrer_id" INTEGER NOT NULL,
    "referee_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "status" "referral_status" NOT NULL DEFAULT 'PENDING',
    "qualifying_booking_id" INTEGER,
    "referrer_points" INTEGER NOT NULL DEFAULT 0,
    "referee_points" INTEGER NOT NULL DEFAULT 0,
    "converted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

-- CreateIndex
-- Unique: a user can only ever be referred once. This is the feature's core
-- integrity constraint, enforced here rather than in application logic.
CREATE UNIQUE INDEX "referrals_referee_id_key" ON "referrals"("referee_id");

-- CreateIndex
CREATE INDEX "referrals_referrer_id_created_at_idx" ON "referrals"("referrer_id", "created_at");

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_id_fkey" FOREIGN KEY ("referee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
