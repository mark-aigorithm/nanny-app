-- CreateEnum
CREATE TYPE "availability_type" AS ENUM ('FULL_TIME', 'PART_TIME', 'OCCASIONAL');

-- AlterTable
ALTER TABLE "nanny_profiles" ADD COLUMN     "availability_type" "availability_type" NOT NULL DEFAULT 'OCCASIONAL',
ADD COLUMN     "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
ADD COLUMN     "review_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "nanny_profile_id" TEXT NOT NULL,
    "mother_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reviews_booking_id_key" ON "reviews"("booking_id");

-- CreateIndex
CREATE INDEX "reviews_nanny_profile_id_idx" ON "reviews"("nanny_profile_id");

-- CreateIndex
CREATE INDEX "reviews_mother_id_idx" ON "reviews"("mother_id");

-- CreateIndex
CREATE INDEX "nanny_profiles_availability_type_idx" ON "nanny_profiles"("availability_type");

-- CreateIndex
CREATE INDEX "nanny_profiles_rating_idx" ON "nanny_profiles"("rating");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_nanny_profile_id_fkey" FOREIGN KEY ("nanny_profile_id") REFERENCES "nanny_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_mother_id_fkey" FOREIGN KEY ("mother_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
