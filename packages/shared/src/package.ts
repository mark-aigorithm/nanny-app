import { z } from 'zod';

// ──────────────────────────────────────────────────────────────
// Packages — admin-curated catalog of purchasable hour bundles
// (e.g. "Starter Pack" — 50 hours for 2000 EGP). Each package pairs
// a whole number of hours with a fixed price. Admin-only for now
// (not consumed by mobile), so this module has no public shape yet.
// Prices are stored/served in EGP; no currency field.
// ──────────────────────────────────────────────────────────────

/** Full admin DTO returned by the admin Packages endpoints. */
export const PackageSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  hours: z.number().int(),
  price: z.number(),
  isActive: z.boolean(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Package = z.infer<typeof PackageSchema>;

export const CreatePackageSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  hours: z.number().int().min(1),
  price: z.number().positive().multipleOf(0.01),
  isActive: z.boolean().default(true),
  expiresAt: z.string().datetime().optional(),
});
export type CreatePackageInput = z.infer<typeof CreatePackageSchema>;

export const UpdatePackageSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).optional(),
    hours: z.number().int().min(1).optional(),
    price: z.number().positive().multipleOf(0.01).optional(),
    isActive: z.boolean().optional(),
    // Nullable so an admin can clear a previously-set expiry.
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update',
  });
export type UpdatePackageInput = z.infer<typeof UpdatePackageSchema>;
