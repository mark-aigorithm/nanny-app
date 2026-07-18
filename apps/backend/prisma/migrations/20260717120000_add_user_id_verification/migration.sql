-- Move identity documents + KYC status onto the users table, unified for BOTH
-- nannies and mothers (Release 1 of a two-release change — the old
-- nanny_profiles.* ID/approval columns are dropped in a later migration once
-- no code reads them anymore).
--
-- A brand-new `id_verification_status` enum type is used (rather than extending
-- `nanny_approval_status`) so that CREATE TYPE and the backfill DML that USES
-- the new values can safely live in the same migration transaction. Postgres
-- forbids `ALTER TYPE ... ADD VALUE` followed by using that value in the same
-- transaction, which is why the existing status enum is left untouched here.

-- 1. New enum types.
CREATE TYPE "id_verification_status" AS ENUM ('PENDING_ID', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');
CREATE TYPE "id_document_type" AS ENUM ('PASSPORT', 'NATIONAL_ID');

-- 2. New nullable columns on users (role-dependent default is set in application code).
ALTER TABLE "users"
  ADD COLUMN "id_verification_status" "id_verification_status",
  ADD COLUMN "id_document_type" "id_document_type",
  ADD COLUMN "id_document_front_url" TEXT,
  ADD COLUMN "id_document_back_url" TEXT,
  ADD COLUMN "id_reviewed_at" TIMESTAMP(3),
  ADD COLUMN "id_rejection_reason" TEXT;

-- 3. Backfill nannies from their profile row. The three shared labels
--    (PENDING_REVIEW/APPROVED/REJECTED) match, so cast enum -> text -> enum
--    (a direct enum-to-enum cast is not allowed in Postgres).
UPDATE "users" u
SET
  "id_verification_status" = np."approval_status"::text::"id_verification_status",
  "id_document_front_url"  = np."id_document_front_url",
  "id_document_back_url"   = np."id_document_back_url",
  "id_reviewed_at"         = np."reviewed_at",
  "id_rejection_reason"    = np."rejection_reason"
FROM "nanny_profiles" np
WHERE np."user_id" = u."id" AND np."deleted_at" IS NULL;

-- 4. Existing mothers have no ID yet -> PENDING_ID, so they are prompted to
--    upload before their next booking. Admins / role-less rows stay NULL.
UPDATE "users"
SET "id_verification_status" = 'PENDING_ID'
WHERE "role" = 'MOTHER' AND "id_verification_status" IS NULL;

-- 5. Index the status for the search/broadcast/gate filters that read it.
CREATE INDEX "users_id_verification_status_idx" ON "users"("id_verification_status");
