-- The admin's decision on an account is its *approval* — for a parent that is
-- an ID check, for a nanny it covers her whole application (profile + ID) —
-- so the column, its enum and the two decision fields drop the `id_` prefix.
-- Renames only: no data moves.
ALTER TYPE "id_verification_status" RENAME TO "approval_status";
ALTER TABLE "users" RENAME COLUMN "id_verification_status" TO "approval_status";
ALTER TABLE "users" RENAME COLUMN "id_reviewed_at" TO "reviewed_at";
ALTER TABLE "users" RENAME COLUMN "id_rejection_reason" TO "rejection_reason";
ALTER INDEX "users_id_verification_status_idx" RENAME TO "users_approval_status_idx";

-- Release 2 of the 2026-07-17 move of KYC onto users: nothing has read these
-- nanny_profiles columns since, and the profile-completeness flag no longer
-- gates anything (approval is the only gate). Dropping the column drops
-- nanny_profiles_approval_status_idx with it.
ALTER TABLE "nanny_profiles"
  DROP COLUMN "is_profile_complete",
  DROP COLUMN "approval_status",
  DROP COLUMN "reviewed_at",
  DROP COLUMN "rejection_reason",
  DROP COLUMN "id_document_front_url",
  DROP COLUMN "id_document_back_url";
DROP TYPE "nanny_approval_status";
