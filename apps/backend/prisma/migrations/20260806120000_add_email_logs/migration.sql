-- Transactional email audit log. One row per send attempt (SENT or FAILED),
-- kept for delivery debugging and to trace a receipt back to its booking.
-- Purely additive: two new enums plus the email_logs table with a nullable FK
-- to users (ON DELETE SET NULL — Prisma's default for the optional relation —
-- so the audit row outlives a user deletion). Ordered after every existing
-- migration; ids and the users FK are sequential integers, consistent with the
-- rest of the schema.

-- CreateEnum
CREATE TYPE "email_template" AS ENUM ('RECEIPT');

-- CreateEnum
CREATE TYPE "email_status" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "email_logs" (
    "id" SERIAL NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "user_id" INTEGER,
    "template" "email_template" NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "email_status" NOT NULL,
    "error" TEXT,
    "reference_type" "notification_reference_type",
    "reference_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_logs_user_id_idx" ON "email_logs"("user_id");

-- CreateIndex
CREATE INDEX "email_logs_template_status_idx" ON "email_logs"("template", "status");

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
