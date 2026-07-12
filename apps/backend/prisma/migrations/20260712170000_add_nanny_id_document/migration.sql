-- Identity documents captured at nanny registration for admin KYC review.
-- Both nullable: existing rows and mother accounts never have them.
ALTER TABLE "nanny_profiles" ADD COLUMN "id_document_front_url" TEXT;
ALTER TABLE "nanny_profiles" ADD COLUMN "id_document_back_url" TEXT;
