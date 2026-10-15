-- CreateTable
CREATE TABLE "service_areas" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "polygon" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "service_areas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_areas_is_active_deleted_at_idx" ON "service_areas"("is_active", "deleted_at");

