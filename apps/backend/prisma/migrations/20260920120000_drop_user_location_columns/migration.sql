-- Second half of the two-release move to the addresses table (see
-- add_addresses_table): users.address / latitude / longitude were backfilled
-- into each user's default address row there and have been unread since.
-- Dropping them is destructive on purpose — the data lives in "addresses".

-- AlterTable
ALTER TABLE "users" DROP COLUMN "address",
DROP COLUMN "latitude",
DROP COLUMN "longitude";
