-- Addresses become the single source of a user's location. Mothers may hold
-- many (one is the default), nannies hold one. Every reader of
-- users.address / users.latitude / users.longitude moves to this table; those
-- columns stay for one release, unread, and are dropped by a later migration.

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "address_id" INTEGER,
ADD COLUMN     "booked_address" JSONB;

-- CreateTable
CREATE TABLE "addresses" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "formatted_address" TEXT NOT NULL,
    "governorate" TEXT,
    "area" TEXT,
    "street" TEXT,
    "building" TEXT,
    "floor" TEXT,
    "apartment" TEXT,
    "landmark" TEXT,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "addresses_user_id_deleted_at_idx" ON "addresses"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "bookings_address_id_idx" ON "bookings"("address_id");

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every user with coordinates gets one default "Home" address.
-- Structured parts are unknown for these rows (the old column was one line).
INSERT INTO "addresses" ("user_id", "label", "formatted_address", "latitude", "longitude", "is_default", "created_at", "updated_at")
SELECT "id", 'Home', COALESCE("address", ''), "latitude", "longitude", true, now(), now()
FROM "users"
WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL;

-- Backfill: link every booking to its mother's (only) address and snapshot it,
-- so the nanny view and the admin console read one shape for old and new rows.
UPDATE "bookings" b
SET "address_id" = a."id",
    "booked_address" = jsonb_build_object(
      'addressId', a."id",
      'label', a."label",
      'formattedAddress', a."formatted_address",
      'governorate', NULL,
      'area', NULL,
      'street', NULL,
      'building', NULL,
      'floor', NULL,
      'apartment', NULL,
      'landmark', NULL,
      'latitude', a."latitude",
      'longitude', a."longitude"
    )
FROM "addresses" a
WHERE a."user_id" = b."mother_id" AND a."is_default" AND a."deleted_at" IS NULL;
