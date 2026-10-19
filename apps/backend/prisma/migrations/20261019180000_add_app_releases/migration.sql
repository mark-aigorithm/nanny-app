-- CreateTable
CREATE TABLE "app_releases" (
    "id" SERIAL NOT NULL,
    "platform" "device_platform" NOT NULL,
    "version" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "release_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "app_releases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_releases_platform_idx" ON "app_releases"("platform");
