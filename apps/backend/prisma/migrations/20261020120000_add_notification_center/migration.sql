-- CreateEnum
CREATE TYPE "user_group_kind" AS ENUM ('STATIC', 'DYNAMIC');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('IN_APP', 'PUSH', 'BOTH');

-- CreateEnum
CREATE TYPE "notification_broadcast_status" AS ENUM ('SENDING', 'SENT', 'PARTIAL', 'FAILED');

-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'ANNOUNCEMENT';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "broadcast_id" INTEGER;

-- AlterTable
ALTER TABLE "user_groups" ADD COLUMN     "kind" "user_group_kind" NOT NULL DEFAULT 'STATIC',
ADD COLUMN     "rules" JSONB;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_app_open_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "image_url" TEXT,
    "channel" "notification_channel" NOT NULL,
    "target_type" "campaign_target_type",
    "package_id" INTEGER,
    "promo_code_id" INTEGER,
    "audience" JSONB NOT NULL,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_broadcasts" (
    "id" SERIAL NOT NULL,
    "template_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "image_url" TEXT,
    "channel" "notification_channel" NOT NULL,
    "target_type" "campaign_target_type",
    "package_id" INTEGER,
    "promo_code_id" INTEGER,
    "promo_code_text" TEXT,
    "audience" JSONB NOT NULL,
    "status" "notification_broadcast_status" NOT NULL DEFAULT 'SENDING',
    "targeted" INTEGER NOT NULL DEFAULT 0,
    "in_app_created" INTEGER NOT NULL DEFAULT 0,
    "push_sent" INTEGER NOT NULL DEFAULT 0,
    "push_failed" INTEGER NOT NULL DEFAULT 0,
    "no_device" INTEGER NOT NULL DEFAULT 0,
    "skipped_groups" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "error" TEXT,
    "published_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "notification_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_templates_deleted_at_idx" ON "notification_templates"("deleted_at");

-- CreateIndex
CREATE INDEX "notification_broadcasts_template_id_created_at_idx" ON "notification_broadcasts"("template_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_broadcasts_status_created_at_idx" ON "notification_broadcasts"("status", "created_at");

-- CreateIndex
CREATE INDEX "notifications_broadcast_id_idx" ON "notifications"("broadcast_id");

-- CreateIndex
CREATE INDEX "users_role_last_app_open_at_idx" ON "users"("role", "last_app_open_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "notification_broadcasts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_broadcasts" ADD CONSTRAINT "notification_broadcasts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "notification_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_broadcasts" ADD CONSTRAINT "notification_broadcasts_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill: until the new app build ships, the last sign-in is the best
-- available signal of when she last opened the app — without it every
-- existing mother would read as "never opened".
UPDATE users SET last_app_open_at = last_login_at;

-- Seed: "All mothers" is a dynamic group with no rules, created by the first
-- superuser (else the first admin). Inserts nothing on a database with no admin,
-- or where a live group already carries the name (admins may have made one).
INSERT INTO user_groups (name, description, kind, rules, created_by_id, created_at, updated_at)
SELECT 'All mothers', 'Every active mother', 'DYNAMIC', '[]'::jsonb, id, now(), now()
FROM users
WHERE role IN ('SUPERUSER','ADMIN') AND deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_groups g WHERE lower(g.name) = 'all mothers' AND g.deleted_at IS NULL
  )
ORDER BY (role = 'SUPERUSER') DESC, id
LIMIT 1;
