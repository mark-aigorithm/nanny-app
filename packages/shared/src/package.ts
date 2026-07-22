import { z } from 'zod';

import { AdminListQuerySchema } from './admin';

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
  /// Days a purchase of this package stays ACTIVE after payment succeeds
  /// (see PackagePurchase.expiresAt).
  validityDays: z.number().int(),
  /// Max distinct skill add-ons a single purchase's hours can cover
  /// (0 = base hours only, no skill add-ons).
  maxSkills: z.number().int(),
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
  // Defaults mirror the DB backfill used for packages that predate these
  // columns — admins can override either at creation time.
  validityDays: z.number().int().min(1).default(30),
  maxSkills: z.number().int().min(0).default(0),
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
    validityDays: z.number().int().min(1).optional(),
    maxSkills: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
    // Nullable so an admin can clear a previously-set expiry.
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update',
  });
export type UpdatePackageInput = z.infer<typeof UpdatePackageSchema>;

// ── Mobile-facing catalog DTO ──────────────────────────────────
export const PublicPackageSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  hours: z.number().int(),
  price: z.number(),
  validityDays: z.number().int(),
  maxSkills: z.number().int(),
});
export type PublicPackage = z.infer<typeof PublicPackageSchema>;

export const PackagePurchaseStatusSchema = z.enum([
  'PENDING_PAYMENT', 'ACTIVE', 'EXPIRED', 'REFUNDED',
]);

export const PackagePurchaseSchema = z.object({
  id: z.number().int(),
  packageName: z.string(),
  hoursPurchased: z.number().int(),
  hoursRemaining: z.number(),
  maxSkills: z.number().int(),
  status: PackagePurchaseStatusSchema,
  purchasedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});
export type PackagePurchase = z.infer<typeof PackagePurchaseSchema>;

export const PackageHoursBalanceSchema = z.object({
  availableHours: z.number(),
  buckets: z.array(PackagePurchaseSchema),
});
export type PackageHoursBalance = z.infer<typeof PackageHoursBalanceSchema>;

export const PurchasePackageSchema = z.object({ packageId: z.number().int().positive() });
export type PurchasePackageInput = z.infer<typeof PurchasePackageSchema>;

// ── Admin package purchase list + ledger detail ────────────────
export const AdminPackagePurchaseSchema = z.object({
  id: z.number().int(),
  buyerName: z.string(),
  buyerEmail: z.string(),
  packageName: z.string(),
  hoursPurchased: z.number().int(),
  hoursRemaining: z.number(),
  hoursConsumed: z.number(),
  pricePaid: z.number(),
  status: PackagePurchaseStatusSchema,
  purchasedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});
export type AdminPackagePurchase = z.infer<typeof AdminPackagePurchaseSchema>;

export const AdminPackagePurchaseListQuerySchema = AdminListQuerySchema.extend({
  status: PackagePurchaseStatusSchema.optional(),
  search: z.string().trim().max(200).optional(),
});
export type AdminPackagePurchaseListQuery = z.infer<typeof AdminPackagePurchaseListQuerySchema>;

export const PackageHoursLedgerEntrySchema = z.object({
  id: z.number().int(),
  type: z.enum(['PURCHASE', 'REDEMPTION', 'REFUND', 'EXPIRY', 'ADMIN_ADJUST']),
  hours: z.number(),
  balanceAfter: z.number(),
  reason: z.string().nullable(),
  bookingId: z.number().int().nullable(),
  createdAt: z.string(),
});
export type PackageHoursLedgerEntry = z.infer<typeof PackageHoursLedgerEntrySchema>;

export const AdminPackagePurchaseDetailSchema = AdminPackagePurchaseSchema.extend({
  ledger: z.array(PackageHoursLedgerEntrySchema),
});
export type AdminPackagePurchaseDetail = z.infer<typeof AdminPackagePurchaseDetailSchema>;
