-- CreateTable
CREATE TABLE "cameras" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stream_url" TEXT NOT NULL,
    "nanny_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cameras_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cameras_nanny_user_id_idx" ON "cameras"("nanny_user_id");

-- CreateIndex
CREATE INDEX "cameras_deleted_at_idx" ON "cameras"("deleted_at");

-- AddForeignKey
ALTER TABLE "cameras" ADD CONSTRAINT "cameras_nanny_user_id_fkey" FOREIGN KEY ("nanny_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
