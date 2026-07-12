-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "promo_code_id" TEXT;

-- CreateIndex
CREATE INDEX "bookings_promo_code_id_idx" ON "bookings"("promo_code_id");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
