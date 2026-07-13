-- CreateEnum
CREATE TYPE "reward_entry_type" AS ENUM ('EARN', 'REDEEM', 'ADMIN_GRANT', 'ADMIN_REVOKE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "notification_type" ADD VALUE 'POINTS_EARNED';
ALTER TYPE "notification_type" ADD VALUE 'POINTS_GRANTED';
ALTER TYPE "notification_type" ADD VALUE 'POINTS_REDEEMED';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "reward_credit_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "reward_credit_hours_applied" DECIMAL(6,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "reward_config" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "points_per_booked_hour" INTEGER NOT NULL DEFAULT 10,
    "redemption_points_per_hour" INTEGER NOT NULL DEFAULT 100,
    "min_redemption_points" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reward_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_wallets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "points_balance" INTEGER NOT NULL DEFAULT 0,
    "credit_hours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "lifetime_earned" INTEGER NOT NULL DEFAULT 0,
    "lifetime_redeemed" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reward_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_ledger_entries" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "reward_entry_type" NOT NULL,
    "points" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "reason" TEXT,
    "booking_id" TEXT,
    "admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reward_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reward_wallets_user_id_key" ON "reward_wallets"("user_id");

-- CreateIndex
CREATE INDEX "reward_ledger_entries_user_id_created_at_idx" ON "reward_ledger_entries"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "reward_ledger_entries_booking_id_idx" ON "reward_ledger_entries"("booking_id");

-- AddForeignKey
ALTER TABLE "reward_wallets" ADD CONSTRAINT "reward_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_ledger_entries" ADD CONSTRAINT "reward_ledger_entries_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "reward_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_ledger_entries" ADD CONSTRAINT "reward_ledger_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_ledger_entries" ADD CONSTRAINT "reward_ledger_entries_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
