import { z } from 'zod';

// ──────────────────────────────────────────────────────────────
// Certifications — admin-curated catalog of nanny credentials
// (e.g. "CPR", "First Aid"). Controlled replacement for the
// free-text NannyProfile.certifications array. Linked to nannies
// many-to-many. Unlike skills, certifications never affect price,
// so this module carries no fee fields. It imports nothing internal
// so it can be consumed by both admin and public nanny schemas
// without creating an import cycle.
// ──────────────────────────────────────────────────────────────

/** Lightweight certification shape embedded in nanny profile/listing responses. */
export const PublicCertificationSchema = z.object({
  id: z.number().int(),
  name: z.string(),
});
export type PublicCertification = z.infer<typeof PublicCertificationSchema>;

/** Full admin DTO returned by the admin Certifications endpoints. */
export const CertificationSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type Certification = z.infer<typeof CertificationSchema>;

export const CreateCertificationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  isActive: z.boolean().default(true),
});
export type CreateCertificationInput = z.infer<typeof CreateCertificationSchema>;

export const UpdateCertificationSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update',
  });
export type UpdateCertificationInput = z.infer<typeof UpdateCertificationSchema>;
