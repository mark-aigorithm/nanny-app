-- Hand-authored: no local database is available in this environment, so this was
-- written by hand and each statement verified against the identifiers Prisma
-- generates for the same schema (`prisma migrate diff --from-empty --to-schema`).

-- 1. A purchase AND a booking now each accrue MANY payment attempts.
-- A declined card leaves its FAILED row behind and the retry inserts a fresh
-- one, so the attempt history is preserved instead of being overwritten in
-- place. Dropping each unique also drops the index it implied, so both are
-- recreated as plain indexes -- both flows look payments up by owner to find
-- the newest attempt.
-- Widening a unique to non-unique is non-destructive: every existing row stays
-- valid, and nothing needs backfilling.
DROP INDEX "payments_package_purchase_id_key";

DROP INDEX "payments_booking_id_key";

CREATE INDEX "payments_package_purchase_id_idx" ON "payments"("package_purchase_id");

CREATE INDEX "payments_booking_id_idx" ON "payments"("booking_id");

-- 2. "At most one ACTIVE package per user", enforced by the database.
-- is_active_slot is true exactly while status = 'ACTIVE' and null otherwise.
-- Postgres treats NULLs as distinct in a unique index, so a user may hold any
-- number of PENDING_PAYMENT / EXPIRED / REFUNDED rows while a second ACTIVE row
-- collides. The service-layer guard stays as the friendly pre-check; this is the
-- guarantee behind it.
ALTER TABLE "package_purchases" ADD COLUMN "is_active_slot" BOOLEAN;

-- Backfill so the invariant holds for rows that predate the column.
UPDATE "package_purchases" SET "is_active_slot" = true
WHERE "status" = 'ACTIVE' AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX "package_purchases_user_id_is_active_slot_key" ON "package_purchases"("user_id", "is_active_slot");
