-- AlterEnum: admins are created by the SUPERUSER (root) account
ALTER TYPE "role" ADD VALUE 'SUPERUSER';

-- AlterEnum: paid bookings await admin acceptance before confirmation
ALTER TYPE "booking_status" ADD VALUE 'PENDING_CONFIRMATION' BEFORE 'CONFIRMED';

-- AlterEnum: nanny is notified when an admin accepts a paid booking
ALTER TYPE "notification_type" ADD VALUE 'BOOKING_CONFIRMED';
