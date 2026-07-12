-- Add registration address + home coordinates to users.
ALTER TABLE "users" ADD COLUMN "address" TEXT;
ALTER TABLE "users" ADD COLUMN "latitude" DECIMAL(10,7);
ALTER TABLE "users" ADD COLUMN "longitude" DECIMAL(10,7);
