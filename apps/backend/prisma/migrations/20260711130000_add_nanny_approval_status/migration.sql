-- CreateEnum
CREATE TYPE "nanny_approval_status" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'NANNY_APPROVED';
ALTER TYPE "notification_type" ADD VALUE 'NANNY_REJECTED';

-- AlterTable
ALTER TABLE "nanny_profiles" ADD COLUMN     "approval_status" "nanny_approval_status" NOT NULL DEFAULT 'PENDING_REVIEW',
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "rejection_reason" TEXT;

-- Backfill: nannies who registered before the vetting flow existed stay usable.
UPDATE "nanny_profiles" SET "approval_status" = 'APPROVED';

-- CreateIndex
CREATE INDEX "nanny_profiles_approval_status_idx" ON "nanny_profiles"("approval_status");
