-- AlterTable
ALTER TABLE "nanny_profiles" ADD COLUMN     "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[];
