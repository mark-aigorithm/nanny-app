-- Email ownership proof by one-time code. Purely additive: a new value on the
-- email_template enum plus the email_verifications table.
--
-- No FK on user_id: the row is an audit trail of a send attempt and must
-- outlive the user, and during nanny registration there is no user row yet.
--
-- Postgres will not let a new enum value be used in the same transaction that
-- adds it, so EMAIL_VERIFICATION is added in its own statement here and first
-- referenced by application code in a later request — never by this migration.

-- AlterEnum
ALTER TYPE "email_template" ADD VALUE 'EMAIL_VERIFICATION';

-- CreateTable
CREATE TABLE "email_verifications" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "token_hash" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),
    "user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_verifications_email_created_at_idx" ON "email_verifications"("email", "created_at");

-- CreateIndex
CREATE INDEX "email_verifications_token_hash_idx" ON "email_verifications"("token_hash");
