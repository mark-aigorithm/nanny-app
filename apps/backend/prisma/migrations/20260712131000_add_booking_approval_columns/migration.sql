-- Approval-flow columns (Issues 2 + 5: pay-after-admin-approval).
--
-- Safe to run in Prisma's transactional migration: CREATE TYPE and ALTER TABLE
-- ADD COLUMN do not reference any *newly ALTER-added* enum value (the new
-- booking_status / notification_type values from the previous migration are
-- only written at runtime by the service layer, never here). The default
-- 'PENDING' below belongs to the brand-new nanny_booking_decision type created
-- in this same migration, which is transaction-safe.

-- CreateEnum: nanny's optional, informational accept/decline of a request.
CREATE TYPE "nanny_booking_decision" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- AlterTable: dual-track decision + admin approval/override audit trail.
ALTER TABLE "bookings"
  ADD COLUMN "nanny_decision"       "nanny_booking_decision" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "nanny_decided_at"     TIMESTAMP(3),
  ADD COLUMN "admin_approved_by_id" TEXT,
  ADD COLUMN "admin_approved_at"    TIMESTAMP(3),
  ADD COLUMN "admin_action_by_id"   TEXT,
  ADD COLUMN "admin_action_at"      TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "bookings_nanny_decision_idx" ON "bookings"("nanny_decision");

-- AddForeignKey: admin who approved (PENDING -> APPROVED).
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_admin_approved_by_id_fkey" FOREIGN KEY ("admin_approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: admin who performed a status override.
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_admin_action_by_id_fkey" FOREIGN KEY ("admin_action_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
