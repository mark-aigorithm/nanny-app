import { z } from 'zod';

import {
  AppliedSkillFeeSchema,
  BookingStatusSchema,
  NannyBookingDecisionSchema,
  PaginationMetaSchema,
  wallClockField,
} from './booking';
import { PublicCertificationSchema } from './certification';
import { BookingChildSchema } from './child';
import { CommunityTagSchema, PostModerationStatusSchema } from './community';
import {
  AvailabilityTypeSchema,
  IdDocumentTypeSchema,
  IdVerificationStatusSchema,
  WeeklyScheduleSchema,
} from './nanny';
import { PublicSkillSchema, SkillFeeTypeSchema } from './skill';
import { PhoneNumberSchema } from './support';

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
  id: z.number().int(),
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
  /**
   * How many children one nanny covers at the base rate. Children beyond this
   * are billed `extraChildFeeValue` each, per hour — see resolveExtraChildFee.
   */
  includedChildrenPerBooking: z.number().int().min(1).max(10),
  /**
   * Hard ceiling on children in a single booking, regardless of willingness to
   * pay. One nanny can only mind so many, so the server rejects above this.
   */
  maxChildrenPerBooking: z.number().int().min(1).max(20),
  /** null = extra children are free. FLAT = EGP/hour each; PERCENTAGE = % of base rate. */
  extraChildFeeType: SkillFeeTypeSchema.nullable(),
  /** Charge per extra child per hour, in EGP (FLAT) or percent (PERCENTAGE). */
  extraChildFeeValue: z.number().min(0).max(100000),
  /** Maximum hours a mother can reserve in a single booking. */
  maxBookingHours: z.number().int().min(1).max(24),
  /** Minimum hours a mother can reserve in a single booking. */
  minBookingHours: z.number().int().min(1).max(24),
  /** Minimum lead time (hours) before a booking's start time when reserving. */
  minAdvanceBookingHours: z.number().int().min(0).max(168),
  /** Hours before start time after which cancellation incurs a fee. */
  cancellationWindowHours: z.number().int().min(0).max(168),
  /**
   * Radius (km) around the booking's location within which nannies are
   * notified of a new request (and see it in their Requests pool). 0 disables
   * distance filtering — every eligible nanny is notified.
   */
  broadcastRadiusKm: z.number().min(0).max(500),
  /**
   * Minutes a booking may sit PENDING (no nanny accepted) before the admin
   * bookings list flags it as a warning (yellow).
   */
  pendingWarningMinutes: z.number().int().min(1).max(10080),
  /**
   * Minutes a booking may sit PENDING before the admin bookings list flags it
   * as critical (red). Must be greater than the warning threshold.
   */
  pendingCriticalMinutes: z.number().int().min(1).max(10080),
  /**
   * Daily booking window, as wall-clock hours in PLATFORM_TIMEZONE. Deliberately
   * NOT refined to `end > start`: `end <= start` is the legal cross-midnight case
   * (8 → 2 means 08:00 to 02:00 the next day) and `end === start` is the legal
   * full-24h case. See `bookingWindowLengthHours`.
   */
  bookingWindowStartHour: z.number().int().min(0).max(23),
  bookingWindowEndHour: z.number().int().min(0).max(23),
  /**
   * Minutes before a confirmed booking's start time when the assigned nanny's
   * phone number is revealed to the parent (and stays visible through the end of
   * the shift). Before this window the number is withheld for privacy. See
   * REVEAL_PHONE_EARLY_MINUTES for the default.
   */
  revealPhoneMinutes: z.number().int().min(0).max(1440),
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
  )
  .refine(
    (v) =>
      v.pendingWarningMinutes === undefined ||
      v.pendingCriticalMinutes === undefined ||
      v.pendingWarningMinutes < v.pendingCriticalMinutes,
    {
      message: 'Pending warning threshold must be below the critical threshold',
      path: ['pendingWarningMinutes'],
    },
  )
  .refine(
    (v) =>
      v.extraChildFeeType !== 'PERCENTAGE' ||
      v.extraChildFeeValue === undefined ||
      v.extraChildFeeValue <= 100,
    {
      message: 'Percentage fee cannot exceed 100',
      path: ['extraChildFeeValue'],
    },
  );
// `includedChildrenPerBooking <= maxChildrenPerBooking` cannot be refined here:
// this schema is `.partial()`, so raising the minimum alone would sail past a
// refine that can only see the fields the admin actually sent. It lives in
// `assertCoherentConfig`, where the update is merged over the current config —
// the same reason the min/max booking-hours rule lives there.
export type UpdatePlatformConfigInput = z.infer<typeof UpdatePlatformConfigSchema>;

/** Admin pricing calculator input — previews a full breakdown for a scenario. */
export const PricePreviewSchema = z.object({
  durationHours: z.number().positive().max(24),
  skillIds: z.array(z.number().int()).default([]),
  /** Children on the hypothetical booking — drives the extra-child fee line. */
  childrenCount: z.number().int().min(1).max(20).default(1),
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
  id: z.number().int(),
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
    id: z.number().int(),
    name: z.string(),
    phone: z.string().nullable(),
  }),
  nanny: z
    .object({
      id: z.number().int(),
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
    id: z.number().int(),
    name: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  nanny: z
    .object({
      id: z.number().int(),
      name: z.string(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
    })
    .nullable(),
  // Pricing breakdown snapshot.
  baseRate: z.number(),
  effectiveHourlyRate: z.number(),
  skillAddOns: z.array(AppliedSkillFeeSchema),
  /** Who the booking was for, snapshotted at creation (names included). */
  children: z.array(BookingChildSchema),
  childrenCount: z.number(),
  extraChildren: z.number(),
  extraChildFeePerHour: z.number(),
  subtotal: z.number(),
  durationMultiplier: z.number(),
  serviceFeePercent: z.number(),
  serviceFeeAmount: z.number(),
  nannyAmount: z.number(),
  platformAmount: z.number(),
  // Applied credits — so the admin editor can seed the current points/package state.
  rewardCreditHours: z.number(),
  packageHoursApplied: z.number(),
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
 *
 * Wall-clock in PLATFORM_TIMEZONE, same contract as CreateBookingSchema — the
 * admin's browser timezone must not decide what a booking time means.
 */
export const UpdateBookingTimesSchema = z.object({
  startTime: wallClockField('startTime'),
  endTime: wallClockField('endTime'),
});
export type UpdateBookingTimesInput = z.infer<typeof UpdateBookingTimesSchema>;

// ──────────────────────────────────────────────────────────────
// Admin booking editor (edit inputs → re-price → settle the money delta)
// ──────────────────────────────────────────────────────────────

/**
 * The editable inputs of a booking — everything the mother originally chose that
 * affects the price. The admin edits these; the server re-prices with the same
 * engine and gates as booking creation, so a manual money override is never
 * needed (and never allowed).
 *
 * Wall-clock in PLATFORM_TIMEZONE, same contract as CreateBookingSchema.
 */
export const AdminEditBookingSchema = z.object({
  startTime: wallClockField('startTime'),
  endTime: wallClockField('endTime'),
  /** Who the booking is for; drives the extra-child fee. At least one child. */
  children: z.array(BookingChildSchema).min(1),
  /** Selected paid skill add-ons. Unknown/inactive ids are rejected server-side. */
  skillIds: z.array(z.number().int()).default([]),
  /**
   * Promo code to apply. `null` clears an existing promo; `undefined` leaves the
   * current one unchanged. Only changeable before payment (see the service).
   */
  promoCode: z.string().trim().min(1).max(32).nullable().optional(),
  /** Apply available prepaid package hours. `undefined` = apply (default), `false` = skip. */
  usePackageHours: z.boolean().optional(),
  /** Care Points hours to redeem. 0/undefined = none. Bounded by the wallet server-side. */
  carePointsHours: z.number().int().min(0).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
export type AdminEditBookingInput = z.infer<typeof AdminEditBookingSchema>;

/** Commit variant: carries the optimistic revision token + a soft-warning ack. */
export const AdminEditBookingCommitSchema = AdminEditBookingSchema.extend({
  /** booking.updatedAt ISO echoed from the preview — rejects a stale edit (409). */
  revision: z.string().min(1),
  /** The admin has seen and accepted the soft (override-able) warnings. */
  acknowledgeSoftWarnings: z.boolean().default(false),
});
export type AdminEditBookingCommitInput = z.infer<typeof AdminEditBookingCommitSchema>;

/**
 * A validation finding on a proposed edit. `block` prevents Save entirely (the
 * edit would violate a booking option); `warn` is override-able by an admin who
 * knowingly accepts it (e.g. an out-of-window time on a running booking).
 */
export const AdminEditWarningSchema = z.object({
  code: z.string(),
  severity: z.enum(['block', 'warn']),
  message: z.string(),
  field: z.string().optional(),
});
export type AdminEditWarning = z.infer<typeof AdminEditWarningSchema>;

/** Compact money snapshot for the old-vs-new comparison in the preview rail. */
export const BookingMoneySummarySchema = z.object({
  totalAmount: z.number(),
  subtotal: z.number(),
  discountAmount: z.number(),
  effectiveHourlyRate: z.number(),
  durationHours: z.number(),
  durationMultiplier: z.number(),
  nannyAmount: z.number(),
  platformAmount: z.number(),
  packageHoursApplied: z.number(),
  packageCreditAmount: z.number(),
  rewardCreditHours: z.number(),
  rewardCreditPoints: z.number().int(),
  rewardCreditAmount: z.number(),
});
export type BookingMoneySummary = z.infer<typeof BookingMoneySummarySchema>;

/** Dry-run result of a proposed edit (POST /admin/bookings/:id/edit/preview). */
export const AdminEditPreviewResponseSchema = z.object({
  old: BookingMoneySummarySchema,
  new: BookingMoneySummarySchema,
  /** Sum of captured payments (amount − refundedAmount) tied to the booking. */
  amountPaid: z.number(),
  /** new.totalAmount − amountPaid. Negative = overpaid (refundable); positive = owes. */
  delta: z.number(),
  refundableAmount: z.number(),
  balanceDueAmount: z.number(),
  warnings: z.array(AdminEditWarningSchema),
  /** booking.updatedAt to echo back on commit for optimistic concurrency. */
  revision: z.string(),
});
export type AdminEditPreviewResponse = z.infer<typeof AdminEditPreviewResponseSchema>;

/**
 * Everything the admin editor needs to render bounded inputs (one GET call):
 * the selectable add-ons, the children/duration/window limits, the mother's
 * Care Points wallet + redemption rules, and her available prepaid package hours.
 */
export const AdminBookingEditContextSchema = z.object({
  skillAddOns: z.array(PublicSkillSchema),
  includedChildrenPerBooking: z.number().int(),
  maxChildrenPerBooking: z.number().int(),
  minBookingHours: z.number().int(),
  maxBookingHours: z.number().int(),
  bookingWindowStartHour: z.number().int(),
  bookingWindowEndHour: z.number().int(),
  carePoints: z.object({
    pointsBalance: z.number().int(),
    redemptionPointsPerHour: z.number().int(),
    minRedemptionPoints: z.number().int(),
  }),
  availablePackageHours: z.number(),
});
export type AdminBookingEditContext = z.infer<typeof AdminBookingEditContextSchema>;

/** Settlement summary attached to the commit / refund responses. */
export const BookingSettlementSchema = z.object({
  delta: z.number(),
  amountPaid: z.number(),
  refundableAmount: z.number(),
  balanceDueAmount: z.number(),
  /** The BookingAdjustment id created when the mother owes more; null otherwise. */
  adjustmentId: z.number().int().nullable(),
});
export type BookingSettlement = z.infer<typeof BookingSettlementSchema>;

export const AdminEditCommitResponseSchema = z.object({
  booking: AdminBookingDetailSchema,
  settlement: BookingSettlementSchema,
});
export type AdminEditCommitResponse = z.infer<typeof AdminEditCommitResponseSchema>;

/**
 * Refund a booking overpayment (POST /admin/bookings/:id/refund).
 * PAYMOB: money back to the card via Paymob's refund API (amount defaults to the
 * full refundable amount). CARE_POINTS: the admin grants a custom number of
 * points — the EGP charge-difference is shown in the UI only for reference, so
 * there is no fixed EGP→points conversion here.
 */
export const AdminRefundBookingSchema = z
  .object({
    method: z.enum(['PAYMOB', 'CARE_POINTS']),
    /** EGP to refund via Paymob. Omit to refund the full refundable amount. */
    amount: z.number().positive().optional(),
    /** Care Points to grant (CARE_POINTS only). */
    points: z.number().int().positive().optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .superRefine((v, ctx) => {
    if (v.method === 'CARE_POINTS' && v.points === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['points'],
        message: 'Points are required for a Care Points refund',
      });
    }
  });
export type AdminRefundBookingInput = z.infer<typeof AdminRefundBookingSchema>;

export const AdminRefundResponseSchema = z.object({
  method: z.enum(['PAYMOB', 'CARE_POINTS']),
  /** EGP refunded to the card (PAYMOB); null for a Care Points refund. */
  refundedAmount: z.number().nullable(),
  /** Points granted (CARE_POINTS); null for a Paymob refund. */
  grantedPoints: z.number().int().nullable(),
  booking: AdminBookingDetailSchema,
});
export type AdminRefundResponse = z.infer<typeof AdminRefundResponseSchema>;

// ──────────────────────────────────────────────────────────────
// Nanny review queue (admin vetting of new nanny registrations)
// ──────────────────────────────────────────────────────────────

export const AdminNannyStatusFilterSchema = z.enum([
  'ALL', 'PENDING_ID', 'PENDING_REVIEW', 'APPROVED', 'REJECTED',
]);
export type AdminNannyStatusFilter = z.infer<typeof AdminNannyStatusFilterSchema>;

export const AdminNannySchema = z.object({
  /** NannyProfile id (used by approve/reject endpoints). */
  id: z.number().int(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  bio: z.string().nullable(),
  location: z.string().nullable(),
  yearsOfExperience: z.number().int().nullable(),
  certifications: z.array(PublicCertificationSchema),
  skills: z.array(PublicSkillSchema),
  isEmailVerified: z.boolean(),
  isPhoneVerified: z.boolean(),
  idVerificationStatus: IdVerificationStatusSchema,
  /** Kind of ID on file (passport → front only); null until uploaded. */
  idDocumentType: IdDocumentTypeSchema.nullable(),
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
 * User id, the nanny's lifetime earnings ("amount gained"), the raw first/last
 * name split, and the registration-captured fields the KYC list view doesn't
 * need but the admin profile editor seeds from (age ranges, availability,
 * weekly schedule). Mirrors the `AdminMotherDetailSchema` precedent.
 */
export const AdminNannyDetailSchema = AdminNannySchema.extend({
  /** The underlying User id — distinct from `id`, which is the NannyProfile id. */
  userId: z.number().int(),
  /** Raw first/last name split so the profile editor can bind them without re-parsing `name`. */
  firstName: z.string(),
  lastName: z.string(),
  ageRanges: z.array(z.string()),
  availabilityType: AvailabilityTypeSchema,
  schedule: WeeklyScheduleSchema.nullable(),
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

export const AdminMotherStatusFilterSchema = z.enum([
  'ALL', 'PENDING_ID', 'PENDING_REVIEW', 'APPROVED', 'REJECTED',
]);
export type AdminMotherStatusFilter = z.infer<typeof AdminMotherStatusFilterSchema>;

export const AdminMotherSchema = z.object({
  /** User id. */
  id: z.number().int(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  /** Home address captured at registration (single source of truth). */
  location: z.string().nullable(),
  isEmailVerified: z.boolean(),
  isPhoneVerified: z.boolean(),
  isActive: z.boolean(),
  /** ID verification state — mothers are reviewed the same way as nannies. */
  idVerificationStatus: IdVerificationStatusSchema.nullable(),
  idDocumentType: IdDocumentTypeSchema.nullable(),
  rejectionReason: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  /** Both sides of the mother's uploaded ID document, for admin KYC review. */
  idDocumentFrontUrl: z.string().nullable(),
  idDocumentBackUrl: z.string().nullable(),
  /** Number of bookings this mother has placed. */
  bookingCount: z.number().int(),
  createdAt: z.string(),
});
export type AdminMother = z.infer<typeof AdminMotherSchema>;

/** Paginated mother list query (GET /admin/mothers). */
export const AdminMotherListQuerySchema = AdminListQuerySchema.extend({
  status: AdminMotherStatusFilterSchema.catch('ALL').default('ALL'),
});
export type AdminMotherListQuery = z.infer<typeof AdminMotherListQuerySchema>;

/**
 * Mother detail page (GET /admin/mothers/:id): the list fields plus the raw
 * first/last name split so the edit form can bind them without re-parsing the
 * combined `name`. Mirrors the AdminNannyDetail precedent.
 */
export const AdminMotherDetailSchema = AdminMotherSchema.extend({
  firstName: z.string(),
  /** May be the '-' placeholder when the account has no last name. */
  lastName: z.string(),
});
export type AdminMotherDetail = z.infer<typeof AdminMotherDetailSchema>;

/**
 * Partial update for a mother account (PATCH /admin/mothers/:id). Only these
 * fields are editable from the admin console — email/phone (Firebase Auth
 * identity), verification flags, and address (tied to matching coordinates)
 * are intentionally omitted.
 */
export const UpdateAdminMotherSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    /** Empty string is allowed; the service stores '-' as the "no last name" placeholder. */
    lastName: z.string().trim().max(100).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateAdminMotherInput = z.infer<typeof UpdateAdminMotherSchema>;

/**
 * Partial update for a nanny account (PATCH /admin/nannies/:id). Mirrors
 * `UpdateAdminMotherSchema`'s precedent, extended with the nanny profile
 * fields captured at registration so admins can correct them post-signup.
 */
export const UpdateAdminNannySchema = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    location: z.string().trim().max(200).optional(),
    bio: z.string().trim().max(600).optional(),
    yearsOfExperience: z.number().int().min(0).max(60).optional(),
    ageRanges: z.array(z.string()).optional(),
    availabilityType: AvailabilityTypeSchema.optional(),
    schedule: WeeklyScheduleSchema.optional(),
    certificationIds: z.array(z.number().int().positive()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update.' });
export type UpdateAdminNanny = z.infer<typeof UpdateAdminNannySchema>;

// ──────────────────────────────────────────────────────────────
// Combined ID review queue (parents + nannies in one KYC gallery)
// ──────────────────────────────────────────────────────────────

/** Which account roles the combined ID-review gallery can be narrowed to. */
export const AdminIdReviewRoleFilterSchema = z.enum(['ALL', 'MOTHER', 'NANNY']);
export type AdminIdReviewRoleFilter = z.infer<typeof AdminIdReviewRoleFilterSchema>;

/** Verification-status filter for the ID-review queue (same states as the per-role lists). */
export const AdminIdReviewStatusFilterSchema = z.enum([
  'ALL', 'PENDING_ID', 'PENDING_REVIEW', 'APPROVED', 'REJECTED',
]);
export type AdminIdReviewStatusFilter = z.infer<typeof AdminIdReviewStatusFilterSchema>;

/**
 * One card in the combined ID-review gallery. Parents and nannies are pooled
 * into a single queue keyed off the shared User row, where KYC state lives.
 */
export const AdminIdReviewSchema = z.object({
  /**
   * Id to pass to this role's approve/reject endpoint — the User id for a
   * MOTHER, the NannyProfile id for a NANNY (those endpoints are keyed
   * differently). Use `userId` for a stable, cross-role identity.
   */
  id: z.number().int(),
  /** Underlying User id — unique across the queue, so it keys the React list. */
  userId: z.number().int(),
  role: z.enum(['MOTHER', 'NANNY']),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  location: z.string().nullable(),
  idDocumentType: IdDocumentTypeSchema.nullable(),
  idDocumentFrontUrl: z.string().nullable(),
  idDocumentBackUrl: z.string().nullable(),
  idVerificationStatus: IdVerificationStatusSchema.nullable(),
  rejectionReason: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminIdReview = z.infer<typeof AdminIdReviewSchema>;

/** Paginated ID-review queue query (GET /admin/id-reviews). Defaults to the pending queue. */
export const AdminIdReviewListQuerySchema = AdminListQuerySchema.extend({
  status: AdminIdReviewStatusFilterSchema.catch('PENDING_REVIEW').default('PENDING_REVIEW'),
  role: AdminIdReviewRoleFilterSchema.catch('ALL').default('ALL'),
});
export type AdminIdReviewListQuery = z.infer<typeof AdminIdReviewListQuerySchema>;

// ──────────────────────────────────────────────────────────────
// Marketplace moderation (review queue + official listings)
// ──────────────────────────────────────────────────────────────

/** Moderation filter for the listing queue. Defaults to the pending queue. */
export const AdminMarketplaceStatusFilterSchema = z.enum([
  'ALL', 'PENDING', 'APPROVED', 'REJECTED',
]);
export type AdminMarketplaceStatusFilter = z.infer<typeof AdminMarketplaceStatusFilterSchema>;

/** One row in the admin marketplace table. */
export const AdminMarketplaceListingSchema = z.object({
  /** CommunityPost id. */
  id: z.number().int(),
  title: z.string(),
  body: z.string().nullable(),
  price: z.number().nullable(),
  imageUrls: z.array(z.string()),
  tags: z.array(z.string()),
  moderationStatus: PostModerationStatusSchema,
  rejectionReason: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  /** Platform-authored listing — pinned in the feed and never reviewed. */
  isOfficial: z.boolean(),
  /** Official listings only: the number buyers contact instead of messaging. */
  contactPhone: z.string().nullable(),
  /** Seller. For an official listing this is the admin who created it. */
  seller: z.object({
    id: z.number().int(),
    name: z.string(),
    avatarUrl: z.string().nullable(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminMarketplaceListing = z.infer<typeof AdminMarketplaceListingSchema>;

/** Paginated listing queue query (GET /admin/marketplace/listings). */
export const AdminMarketplaceListQuerySchema = AdminListQuerySchema.extend({
  status: AdminMarketplaceStatusFilterSchema.catch('PENDING').default('PENDING'),
});
export type AdminMarketplaceListQuery = z.infer<typeof AdminMarketplaceListQuerySchema>;

/**
 * The reason is mandatory here (unlike `RejectNannySchema`) — the seller has to
 * know what to change before she resubmits.
 */
export const RejectListingSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required').max(500),
});
export type RejectListingInput = z.infer<typeof RejectListingSchema>;

/** Official ("Sold by NannyNow") listing an admin publishes directly. */
export const CreateOfficialListingSchema = z.object({
  title: z.string().trim().min(1, 'Product name is required').max(200),
  body: z.string().trim().max(2000).optional(),
  price: z.number().positive('Price must be greater than 0'),
  imageUrls: z
    .array(z.string().url())
    .min(1, 'At least one image is required')
    .max(4),
  tags: z.array(CommunityTagSchema).max(5).default([]),
  contactPhone: PhoneNumberSchema,
});
export type CreateOfficialListingInput = z.infer<typeof CreateOfficialListingSchema>;

export const UpdateOfficialListingSchema = CreateOfficialListingSchema.partial();
export type UpdateOfficialListingInput = z.infer<typeof UpdateOfficialListingSchema>;

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
  id: z.number().int(),
  name: z.string(),
  email: z.string(),
  role: z.enum(['ADMIN', 'SUPERUSER']),
  createdAt: z.string(),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;
