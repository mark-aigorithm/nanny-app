import { z } from 'zod';

import { BookingStatusSchema, NannyBookingDecisionSchema } from './booking';
import { NannyApprovalStatusSchema } from './nanny';
import { PublicSkillSchema } from './skill';

// ──────────────────────────────────────────────────────────────
// Promo codes
// ──────────────────────────────────────────────────────────────

export const DiscountTypeSchema = z.enum(['FLAT', 'PERCENTAGE']);
export type DiscountType = z.infer<typeof DiscountTypeSchema>;

export const CreatePromoCodeSchema = z
  .object({
    code: z
      .string()
      .min(3)
      .max(32)
      .regex(/^[A-Z0-9_-]+$/, 'Use uppercase letters, digits, - or _'),
    discountType: DiscountTypeSchema,
    /** Flat amount in EGP, or percentage (0–100] when discountType is PERCENTAGE. */
    value: z.number().positive(),
    /** Total redemptions allowed across all users. Omit for unlimited. */
    maxUsage: z.number().int().positive().optional(),
    /** Redemptions allowed per user. Omit for unlimited. */
    maxUsagePerUser: z.number().int().positive().optional(),
    expiresAt: z.string().datetime().optional(),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.discountType !== 'PERCENTAGE' || v.value <= 100, {
    message: 'Percentage discount cannot exceed 100',
    path: ['value'],
  });
export type CreatePromoCodeInput = z.infer<typeof CreatePromoCodeSchema>;

export const UpdatePromoCodeSchema = z
  .object({
    discountType: DiscountTypeSchema.optional(),
    value: z.number().positive().optional(),
    maxUsage: z.number().int().positive().nullable().optional(),
    maxUsagePerUser: z.number().int().positive().nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (v) => v.discountType !== 'PERCENTAGE' || v.value === undefined || v.value <= 100,
    { message: 'Percentage discount cannot exceed 100', path: ['value'] },
  );
export type UpdatePromoCodeInput = z.infer<typeof UpdatePromoCodeSchema>;

export const PromoCodeSchema = z.object({
  id: z.string(),
  code: z.string(),
  discountType: DiscountTypeSchema,
  value: z.number(),
  maxUsage: z.number().int().nullable(),
  maxUsagePerUser: z.number().int().nullable(),
  usageCount: z.number().int(),
  expiresAt: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type PromoCode = z.infer<typeof PromoCodeSchema>;

// ──────────────────────────────────────────────────────────────
// Platform configuration (app_settings key/value pairs)
// ──────────────────────────────────────────────────────────────

export const PlatformConfigSchema = z.object({
  /** Platform service fee taken on each booking, in percent. */
  serviceFeePercent: z.number().min(0).max(100),
  /** Maximum hours a mother can reserve in a single booking. */
  maxBookingHours: z.number().int().min(1).max(24),
  /** Minimum hours a mother can reserve in a single booking. */
  minBookingHours: z.number().int().min(1).max(24),
  /** Minimum lead time (hours) before a booking's start time when reserving. */
  minAdvanceBookingHours: z.number().int().min(0).max(168),
  /** Hours before start time after which cancellation incurs a fee. */
  cancellationWindowHours: z.number().int().min(0).max(168),
});
export type PlatformConfig = z.infer<typeof PlatformConfigSchema>;

export const UpdatePlatformConfigSchema = PlatformConfigSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: 'Provide at least one setting to update' },
);
export type UpdatePlatformConfigInput = z.infer<typeof UpdatePlatformConfigSchema>;

// ──────────────────────────────────────────────────────────────
// Bookings (admin booking review queue)
// ──────────────────────────────────────────────────────────────

export const AdminBookingStatusFilterSchema = z.enum([
  'ALL', 'PENDING', 'APPROVED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS',
  'COMPLETED', 'CANCELLED', 'REFUNDED',
]);
export type AdminBookingStatusFilter = z.infer<typeof AdminBookingStatusFilterSchema>;

export const AdminBookingSchema = z.object({
  id: z.string(),
  status: z.string(),
  /** Nanny's advisory accept/decline — admin sees "accepted / declined / no response". */
  nannyDecision: NannyBookingDecisionSchema,
  type: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  durationHours: z.number(),
  totalAmount: z.number(),
  discountAmount: z.number(),
  promoCode: z.string().nullable(),
  paymentStatus: z.string().nullable(),
  mother: z.object({
    id: z.string(),
    name: z.string(),
    phone: z.string().nullable(),
  }),
  nanny: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .nullable(),
  createdAt: z.string(),
});
export type AdminBooking = z.infer<typeof AdminBookingSchema>;

/** Admin rejects a booking request (→ CANCELLED). Optional operator note. */
export const RejectAdminBookingSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});
export type RejectAdminBookingInput = z.infer<typeof RejectAdminBookingSchema>;

/**
 * Admin status override (PATCH /admin/bookings/:id/status). The target must be
 * a valid transition from the current status; a COMPLETED booking is locked.
 * REFUNDED is not an admin-settable target (payments own that state).
 */
export const SetBookingStatusSchema = z.object({
  status: BookingStatusSchema.exclude(['REFUNDED']),
});
export type SetBookingStatusInput = z.infer<typeof SetBookingStatusSchema>;

// ──────────────────────────────────────────────────────────────
// Nanny review queue (admin vetting of new nanny registrations)
// ──────────────────────────────────────────────────────────────

export const AdminNannyStatusFilterSchema = z.enum([
  'ALL', 'PENDING_REVIEW', 'APPROVED', 'REJECTED',
]);
export type AdminNannyStatusFilter = z.infer<typeof AdminNannyStatusFilterSchema>;

export const AdminNannySchema = z.object({
  /** NannyProfile id (used by approve/reject endpoints). */
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  bio: z.string().nullable(),
  location: z.string().nullable(),
  yearsOfExperience: z.number().int().nullable(),
  hourlyRate: z.number().nullable(),
  certifications: z.array(z.string()),
  skills: z.array(PublicSkillSchema),
  isEmailVerified: z.boolean(),
  isPhoneVerified: z.boolean(),
  approvalStatus: NannyApprovalStatusSchema,
  rejectionReason: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminNanny = z.infer<typeof AdminNannySchema>;

export const RejectNannySchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});
export type RejectNannyInput = z.infer<typeof RejectNannySchema>;

// ──────────────────────────────────────────────────────────────
// Admin user management (superuser only)
// ──────────────────────────────────────────────────────────────

export const CreateAdminSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type CreateAdminInput = z.infer<typeof CreateAdminSchema>;

export const AdminUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(['ADMIN', 'SUPERUSER']),
  createdAt: z.string(),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;
