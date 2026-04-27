-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "paymob_intention_id" TEXT,
ADD COLUMN     "paymob_client_secret" TEXT,
ADD COLUMN     "paymob_reconcile_anchor_at" TIMESTAMP(3),
ADD COLUMN     "paymob_reconcile_attempt" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paymob_next_reconcile_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "payments_paymob_next_reconcile_at_idx" ON "payments"("paymob_next_reconcile_at");
