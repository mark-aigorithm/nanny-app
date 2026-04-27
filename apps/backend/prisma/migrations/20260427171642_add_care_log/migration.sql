-- CreateEnum
CREATE TYPE "care_log_type" AS ENUM ('MEAL', 'NAP', 'DIAPER', 'ACTIVITY', 'CUSTOM');

-- CreateTable
CREATE TABLE "care_logs" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "nanny_profile_id" TEXT NOT NULL,
    "type" "care_log_type" NOT NULL,
    "custom_label" TEXT,
    "notes" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "evidence_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "care_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "care_logs_booking_id_idx" ON "care_logs"("booking_id");

-- CreateIndex
CREATE INDEX "care_logs_nanny_profile_id_idx" ON "care_logs"("nanny_profile_id");

-- CreateIndex
CREATE INDEX "care_logs_occurred_at_idx" ON "care_logs"("occurred_at");

-- AddForeignKey
ALTER TABLE "care_logs" ADD CONSTRAINT "care_logs_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_logs" ADD CONSTRAINT "care_logs_nanny_profile_id_fkey" FOREIGN KEY ("nanny_profile_id") REFERENCES "nanny_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
