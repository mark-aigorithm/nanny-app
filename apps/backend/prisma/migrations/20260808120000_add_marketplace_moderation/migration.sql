-- Marketplace review cycle + official (platform-authored) listings.
-- Purely additive. `moderation_status` defaults to APPROVED so every post that
-- predates moderation — and every Q&A/event, which is never reviewed — stays
-- live without a backfill; only the marketplace create/update paths write
-- PENDING. `reviewed_by_id` is the acting admin (ON DELETE SET NULL, Prisma's
-- default for an optional relation, so the audit trail outlives an admin).

-- CreateEnum
CREATE TYPE "post_moderation_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'MARKETPLACE_LISTING_APPROVED';
ALTER TYPE "notification_type" ADD VALUE 'MARKETPLACE_LISTING_REJECTED';

-- AlterEnum
ALTER TYPE "notification_reference_type" ADD VALUE 'COMMUNITY_POST';

-- AlterTable
ALTER TABLE "community_posts"
    ADD COLUMN "moderation_status" "post_moderation_status" NOT NULL DEFAULT 'APPROVED',
    ADD COLUMN "rejection_reason" TEXT,
    ADD COLUMN "reviewed_at" TIMESTAMP(3),
    ADD COLUMN "reviewed_by_id" INTEGER,
    ADD COLUMN "is_official" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "contact_phone" TEXT;

-- CreateIndex
CREATE INDEX "community_posts_type_moderation_status_is_official_created__idx" ON "community_posts"("type", "moderation_status", "is_official", "created_at");

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
