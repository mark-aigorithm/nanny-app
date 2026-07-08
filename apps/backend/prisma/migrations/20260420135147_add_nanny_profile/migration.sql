-- CreateTable
CREATE TABLE "nanny_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "bio" TEXT,
    "location" TEXT,
    "years_of_experience" INTEGER,
    "hourly_rate" DECIMAL(10,2),
    "certifications" TEXT[],
    "age_ranges" TEXT[],
    "schedule" JSONB,
    "is_profile_complete" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "nanny_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nanny_profiles_user_id_key" ON "nanny_profiles"("user_id");

-- AddForeignKey
ALTER TABLE "nanny_profiles" ADD CONSTRAINT "nanny_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
