-- AlterEnum
ALTER TYPE "reward_entry_type" ADD VALUE 'REFUND';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "reward_credit_points" INTEGER NOT NULL DEFAULT 0;
