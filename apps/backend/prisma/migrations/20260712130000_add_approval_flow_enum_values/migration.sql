-- Approval-flow enum values (Issues 2 + 5: pay-after-admin-approval).
--
-- IMPORTANT: `ALTER TYPE ... ADD VALUE` cannot be used in the same
-- transaction that also references the new value. Postgres also historically
-- forbade running ADD VALUE inside a transaction block at all. This migration
-- therefore contains ONLY enum additions — no DML, no column changes that use
-- these values. The columns/DML that consume them live in the following
-- migration (20260712131000_add_booking_approval_columns).

-- BookingStatus: mother's request is admin-APPROVED before any payment is
-- taken. Placed right after PENDING to reflect the new lifecycle order.
ALTER TYPE "booking_status" ADD VALUE IF NOT EXISTS 'APPROVED' AFTER 'PENDING';

-- NotificationType:
--   BOOKING_REQUESTED — nanny + admins, when a mother creates a request.
--   BOOKING_APPROVED  — mother (prompt payment) + nanny, on admin approval.
--   BOOKING_CANCELLED — mother + nanny, on admin reject / cancel override.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'BOOKING_REQUESTED' AFTER 'MARKETPLACE_MESSAGE';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'BOOKING_APPROVED' AFTER 'BOOKING_REQUESTED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'BOOKING_CANCELLED' AFTER 'BOOKING_CONFIRMED';
