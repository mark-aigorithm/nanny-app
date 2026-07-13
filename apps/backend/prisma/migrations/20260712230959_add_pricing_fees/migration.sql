-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "duration_multiplier" DECIMAL(5,4) NOT NULL DEFAULT 1,
ADD COLUMN     "effective_hourly_rate" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "nanny_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "platform_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "selected_skill_fees" JSONB;

-- AlterTable
ALTER TABLE "skills" ADD COLUMN     "fee_type" "discount_type",
ADD COLUMN     "fee_value" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "duration_multiplier_rules" (
    "id" TEXT NOT NULL,
    "min_hours" INTEGER NOT NULL,
    "multiplier" DECIMAL(5,4) NOT NULL,
    "label" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "duration_multiplier_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "duration_multiplier_rules_is_active_idx" ON "duration_multiplier_rules"("is_active");

-- CreateIndex
CREATE INDEX "duration_multiplier_rules_deleted_at_idx" ON "duration_multiplier_rules"("deleted_at");
