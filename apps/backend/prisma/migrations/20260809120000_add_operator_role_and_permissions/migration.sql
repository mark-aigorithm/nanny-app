-- Operator role: an admin-console account whose reach is defined per section by
-- the superuser. Purely additive. `admin_permissions` is nullable and only ever
-- written for an OPERATOR — ADMIN and SUPERUSER keep implicit full access, so
-- no backfill is needed for existing admin rows.

-- AlterEnum
ALTER TYPE "role" ADD VALUE 'OPERATOR';

-- AlterTable
-- Section → access-level map, e.g. {"bookings":"VIEW","marketplace":"MANAGE"}.
-- Shape is owned by OperatorPermissionsSchema in @nanny-app/shared; the service
-- layer parses it on every read rather than trusting what's in the column.
ALTER TABLE "users"
    ADD COLUMN "admin_permissions" JSONB;
