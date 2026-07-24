-- Hand-authored: no local database is available in this environment, so this was
-- written by hand and each identifier matched against the names Prisma generates
-- for the same schema (see the sibling migrations for the same convention).

-- 1. A mother's saved children. Used to prefill her next booking; the booking
-- itself keeps an id-less snapshot (bookings.booked_children) so editing or
-- removing a child here never rewrites a booking that already happened.
CREATE TABLE "children" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" TEXT,
    "age_years" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "children_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "children_user_id_deleted_at_idx" ON "children"("user_id", "deleted_at");

ALTER TABLE "children" ADD CONSTRAINT "children_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Children on a booking. The extra-child fee is already folded into
-- effective_hourly_rate; these columns exist so the breakdown can be itemised
-- later without re-deriving it from a platform config that may have changed
-- since. The defaults describe every booking made before children were modelled
-- -- one child, nothing extra -- so no backfill is needed.
ALTER TABLE "bookings" ADD COLUMN "children_count" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "bookings" ADD COLUMN "extra_children" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "bookings" ADD COLUMN "extra_child_fee_per_hour" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "bookings" ADD COLUMN "booked_children" JSONB;

-- 3. Platform settings for the new rule. Values match DEFAULTS in
-- app-settings.service.ts; the service falls back to those for any missing key,
-- so this is about making them visible and editable in the admin console.
-- ON CONFLICT DO NOTHING keeps a re-run from clobbering an admin's edits.
INSERT INTO "app_settings" ("key", "value", "created_at", "updated_at")
VALUES
    ('included_children_per_booking', '2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('max_children_per_booking', '4', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('extra_child_fee_type', 'FLAT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('extra_child_fee_value', '30', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
