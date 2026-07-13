import { z } from 'zod';

import {
  AppliedSkillFeeSchema,
  BookingStatusSchema,
  NannyBookingDecisionSchema,
  PaginationMetaSchema,
} from './booking';
import { NannyApprovalStatusSchema } from './nanny';
import { PublicSkillSchema } from './skill';

// Re-export the shared pagination meta so admin consumers can import it alongside
// the admin list/detail schemas.
export { PaginationMetaSchema };
export type { PaginationMeta } from './booking';

// ──────────────────────────────────────────────────────────────
// Admin list pagination (shared by every paginated admin table)
// ──────────────────────────────────────────────────────────────

/** Predefined "records per page" choices offered by the admin table footer. */
export const ADMIN_PAGE_SIZES = [10, 20, 50, 100] as const;
export const ADMIN_DEFAULT_PAGE_SIZE = 20;
/**
 * Hard ceiling on a single page. The UI only offers ADMIN_PAGE_SIZES, but
 * internal aggregate callers (e.g. the dashboard, which sums client-side) may
 * request a larger page — capped here to bound the query.
 */
export const ADMIN_MAX_PAGE_SIZE = 200;

/** Base page/limit query for any paginated admin list endpoint. */
export const AdminListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(ADMIN_MAX_PAGE_SIZE).default(ADMIN_DEFAULT_PAGE_SIZE),
});
export type AdminListQuery = z.infer<typeof AdminListQuerySchema>;

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
  /** Legacy platform service fee — retained for back-compat; superseded by the split. */
  serviceFeePercent: z.number().min(0).max(100),
  /**
   * Base hourly rate (EGP) charged for every booking before any per-skill
   * add-ons or duration adjustments. Bookings no longer use a per-nanny rate —
   * the mother sees this price up front and any nanny who claims the request is
   * paid against it.
   */
  standardHourlyRate: z.number().positive().max(100000),
  /** Nanny's share of each booking total, in percent. */
  nannyPercent: z.number().min(0).max(100),
  /** Platform's share of each booking total, in percent. */
  platformPercent: z.number().min(0).max(100),
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

export const UpdatePlatformConfigSchema = PlatformConfigSchema.partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one setting to update',
  })
  .refine(
    (v) =>
      v.nannyPercent === undefined ||
      v.platformPercent === undefined ||
      Math.round((v.nannyPercent + v.platformPercent) * 100) === 10000,
    {
      message: 'Nanny and platform percentages must add up to 100',
      path: ['nannyPercent'],
    },
  );
export type UpdatePlatformConfigInput = z.infer<typeof UpdatePlatformConfigSchema>;

/** Admin pricing calculator input — previews a full breakdown for a scenario. */
export const PricePreviewSchema = z.object({
  durationHours: z.number().positive().max(24),
  skillIds: z.array(z.string()).default([]),
  discountAmount: z.number().min(0).optional(),
});
export type PricePreviewInput = z.infer<typeof PricePreviewSchema>;

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

/** Paginated booking list query (GET /admin/bookings). */
export const AdminBookingListQuerySchema = AdminListQuerySchema.extend({
  status: AdminBookingStatusFilterSchema.catch('ALL').default('ALL'),
});
export type AdminBookingListQuery = z.infer<typeof AdminBookingListQuerySchema>;

/** Full payment record for the admin booking detail page. */
export const AdminBookingPaymentSchema = z.object({
  status: z.string(),
  method: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  paymobOrderId: z.string().nullable(),
  paymobTransactionId: z.string().nullable(),
  paymobIntentionId: z.string().nullable(),
  failureReason: z.string().nullable(),
  refundedAmount: z.number(),
  refundedAt: z.string().nullable(),
});
export type AdminBookingPayment = z.infer<typeof AdminBookingPaymentSchema>;

/**
 * Everything the admin booking detail page shows (GET /admin/bookings/:id):
 * the list fields plus the full pricing breakdown, payment record, promo/discount,
 * special instructions, lifecycle timestamps, and a future-ready loyalty field.
 */
export const AdminBookingDetailSchema = AdminBookingSchema.extend({
  // Enriched parties.
  mother: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  nanny: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
    })
    .nullable(),
  // Pricing breakdown snapshot.
  baseRate: z.number(),
  effectiveHourlyRate: z.number(),
  skillAddOns: z.array(AppliedSkillFeeSchema),
  subtotal: z.number(),
  durationMultiplier: z.number(),
  serviceFeePercent: z.number(),
  serviceFeeAmount: z.number(),
  nannyAmount: z.number(),
  platformAmount: z.number(),
  // Full payment record (supersedes the list's flat `paymentStatus`).
  payment: AdminBookingPaymentSchema.nullable(),
  // Notes & lifecycle.
  specialInstructions: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  adminApprovedAt: z.string().nullable(),
  nannyDecidedAt: z.string().nullable(),
  nannyCheckedInAt: z.string().nullable(),
  nannyCheckedOutAt: z.string().nullable(),
  updatedAt: z.string(),
  /** Loyalty points redeemed against this booking. Not yet implemented — always null for now. */
  pointsRedeemed: z.number().nullable(),
});
export type AdminBookingDetail = z.infer<typeof AdminBookingDetailSchema>;

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

/**
 * Admin edits a booking's scheduled window (PATCH /admin/bookings/:id/times).
 * The server recomputes duration and the price breakdown from the new window.
 */
export const UpdateBookingTimesSchema = z.object({
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }),
});
export type UpdateBookingTimesInput = z.infer<typeof UpdateBookingTimesSchema>;

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
  certifications: z.array(z.string()),
  skills: z.array(PublicSkillSchema),
  isEmailVerified: z.boolean(),
  isPhoneVerified: z.boolean(),
  approvalStatus: NannyApprovalStatusSchema,
  rejectionReason: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  /** Both sides of the nanny's uploaded ID document, for admin KYC review. */
  idDocumentFrontUrl: z.string().nullable(),
  idDocumentBackUrl: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminNanny = z.infer<typeof AdminNannySchema>;

/** Paginated nanny list query (GET /admin/nannies). */
export const AdminNannyListQuerySchema = AdminListQuerySchema.extend({
  status: AdminNannyStatusFilterSchema.catch('PENDING_REVIEW').default('PENDING_REVIEW'),
});
export type AdminNannyListQuery = z.infer<typeof AdminNannyListQuerySchema>;

/**
 * Nanny detail page (GET /admin/nannies/:id): the list fields plus the underlying
 * User id and the nanny's lifetime earnings ("amount gained").
 */
export const AdminNannyDetailSchema = AdminNannySchema.extend({
  /** The underlying User id — distinct from `id`, which is the NannyProfile id. */
  userId: z.string(),
  /** Lifetime earnings: sum of `nannyAmount` across the nanny's COMPLETED bookings (EGP). */
  amountGained: z.number(),
  /** Number of COMPLETED bookings contributing to `amountGained`. */
  completedBookings: z.number().int(),
});
export type AdminNannyDetail = z.infer<typeof AdminNannyDetailSchema>;

export const RejectNannySchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});
export type RejectNannyInput = z.infer<typeof RejectNannySchema>;

// ──────────────────────────────────────────────────────────────
// Mothers directory (admin read-only list of parent accounts)
// ──────────────────────────────────────────────────────────────

export const AdminMotherSchema = z.object({
  /** User id. */
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  /** Home address captured at registration (single source of truth). */
  location: z.string().nullable(),
  isEmailVerified: z.boolean(),
  isPhoneVerified: z.boolean(),
  isActive: z.boolean(),
  /** Number of bookings this mother has placed. */
  bookingCount: z.number().int(),
  createdAt: z.string(),
});
export type AdminMother = z.infer<typeof AdminMotherSchema>;

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
