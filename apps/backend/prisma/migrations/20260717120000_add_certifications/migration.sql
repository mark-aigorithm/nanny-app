-- Replaces the free-text NannyProfile.certifications array with an admin-curated
-- Certification catalog joined to nannies via nanny_certifications. Pre-launch,
-- so the free-text column is dropped outright (no production data to preserve).

-- DropColumn
ALTER TABLE "nanny_profiles" DROP COLUMN "certifications";

-- CreateTable
CREATE TABLE "certifications" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nanny_certifications" (
    "id" TEXT NOT NULL,
    "nanny_profile_id" TEXT NOT NULL,
    "certification_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "nanny_certifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certifications_name_key" ON "certifications"("name");

-- CreateIndex
CREATE INDEX "certifications_deleted_at_idx" ON "certifications"("deleted_at");

-- CreateIndex
CREATE INDEX "nanny_certifications_nanny_profile_id_idx" ON "nanny_certifications"("nanny_profile_id");

-- CreateIndex
CREATE INDEX "nanny_certifications_certification_id_idx" ON "nanny_certifications"("certification_id");

-- CreateIndex
CREATE UNIQUE INDEX "nanny_certifications_nanny_profile_id_certification_id_key" ON "nanny_certifications"("nanny_profile_id", "certification_id");

-- AddForeignKey
ALTER TABLE "nanny_certifications" ADD CONSTRAINT "nanny_certifications_nanny_profile_id_fkey" FOREIGN KEY ("nanny_profile_id") REFERENCES "nanny_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nanny_certifications" ADD CONSTRAINT "nanny_certifications_certification_id_fkey" FOREIGN KEY ("certification_id") REFERENCES "certifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
