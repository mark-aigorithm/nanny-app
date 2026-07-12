-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nanny_skills" (
    "id" TEXT NOT NULL,
    "nanny_profile_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "nanny_skills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "skills_name_key" ON "skills"("name");

-- CreateIndex
CREATE INDEX "skills_deleted_at_idx" ON "skills"("deleted_at");

-- CreateIndex
CREATE INDEX "nanny_skills_nanny_profile_id_idx" ON "nanny_skills"("nanny_profile_id");

-- CreateIndex
CREATE INDEX "nanny_skills_skill_id_idx" ON "nanny_skills"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "nanny_skills_nanny_profile_id_skill_id_key" ON "nanny_skills"("nanny_profile_id", "skill_id");

-- AddForeignKey
ALTER TABLE "nanny_skills" ADD CONSTRAINT "nanny_skills_nanny_profile_id_fkey" FOREIGN KEY ("nanny_profile_id") REFERENCES "nanny_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nanny_skills" ADD CONSTRAINT "nanny_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
