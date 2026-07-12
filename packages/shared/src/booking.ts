import { z } from 'zod';

import { PublicDurationRuleSchema } from './duration-rule';
import { PublicSkillSchema, SkillFeeTypeSchema } from './skill';

// ──────────────────────────────────────────────────────────────
// Booking — shared Zod schemas
// ──────────────────────────────────────────────────────────────

export const BookingStatusSchema = z.enum([
  'PENDING', 'APPROVED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REFUNDED',
]);
export const BookingStatus = BookingStatusSchema.enum;
export type BookingStatus = z.infer<typeof BookingStatusSchema>;

/**
 * Nanny's optional, informational response to a booking request. Advisory
 * only — the admin's approval decides the booking's `status`. The nanny UI
 * reads this to show "you accepted / declined"; the admin UI reads it to show
 * "nanny accepted / declined / no response".
 */
export const NannyBookingDecisionSchema = z.enum(['PENDING', 'ACCEPTED', 'DECLINED']);
export const NannyBookingDecision = NannyBookingDecisionSchema.enum;
export type NannyBookingDecision = z.infer<typeof NannyBookingDecisionSchema>;

export const BookingTypeSchema = z.enum(['STANDARD', 'EMERGENCY']);
export const BookingType = BookingTypeSchema.enum;
export type BookingType = z.infer<typeof BookingTypeSchema>;

export const PaymentStatusSchema = z.enum([
  'PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED',
]);
export const PaymentStatus = PaymentStatusSchema.enum;
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const PaymentMethodSchema = z.enum(['CARD', 'APPLE_PAY', 'GOOGLE_PAY', 'WALLET']);
export const PaymentMethod = PaymentMethodSchema.enum;
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

// ── Price breakdown ─────────────────────────────────────────────────────────

/** A selected skill add-on and its per-hour fee contribution. */
export const AppliedSkillFeeSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** null = the skill was requested but carries no fee (adds 0). */
  feeType: SkillFeeTypeSchema.nullable(),
  feeValue: z.number(),
  /** EGP added to the hourly rate by this add-on. */
  amountPerHour: z.number(),
});
export type AppliedSkillFee = z.infer<typeof AppliedSkillFeeSchema>;

export const PriceBreakdownSchema = z.object({
  baseRate: z.number(),
  durationHours: z.number(),
  /** Selected per-skill add-ons applied to the hourly rate. */
  skillAddOns: z.array(AppliedSkillFeeSchema),
  /** baseRate + sum of add-on per-hour fees. */
  effectiveHourlyRate: z.number(),
  subtotal: z.number(),
  /** Duration tier factor applied to the subtotal (1 = none). */
  durationMultiplier: z.number(),
  discountAmount: z.number(),
  /** Legacy platform service fee — retained for back-compat; 0 under the split model. */
  serviceFeePercent: z.number(),
  serviceFeeAmount: z.number(),
  totalAmount: z.number(),
  /** Revenue split: nanny's share vs the platform's share of totalAmount. */
  nannyPercent: z.number(),
  platformPercent: z.number(),
  nannyAmount: z.number(),
  platformAmount: z.number(),
});
export type PriceBreakdown = z.infer<typeof PriceBreakdownSchema>;

// ── Nanny summaries ──────────────────────────────────────────────────────────

export const NannySummarySchema = z.object({
  nannyProfileId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().nullable(),
  hourlyRate: z.number().nullable(),
  location: z.string().nullable(),
});
export type NannySummary = z.infer<typeof NannySummarySchema>;

export const NearbyNannySchema = z.object({
  nannyProfileId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().nullable(),
  hourlyRate: z.number().nullable(),
  location: z.string().nullable(),
  distanceKm: z.number(),
  ageRanges: z.array(z.string()),
  yearsOfExperience: z.number().nullable(),
});
export type NearbyNanny = z.infer<typeof NearbyNannySchema>;

// ── Booking response ─────────────────────────────────────────────────────────

export const BookingPaymentSummarySchema = z.object({
  id: z.string(),
  status: PaymentStatusSchema,
  method: PaymentMethodSchema,
  amount: z.number(),
});

export const BookingMyReviewSchema = z.object({
  id: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  createdAt: z.string(),
});
export type BookingMyReview = z.infer<typeof BookingMyReviewSchema>;

export const BookingResponseSchema = z.object({
  id: z.string(),
  motherId: z.string(),
  motherFirstName: z.string(),
  motherLastName: z.string(),
  motherAvatarUrl: z.string().nullable(),
  nannyProfileId: z.string().nullable(),
  nanny: NannySummarySchema.nullable(),
  status: BookingStatusSchema,
  /** Nanny's optional accept/decline (informational — admin approval is authoritative). */
  nannyDecision: NannyBookingDecisionSchema,
  /** When the nanny recorded her decision, or null if she hasn't responded. */
  nannyDecidedAt: z.string().nullable(),
  /** When an admin approved the booking (PENDING → APPROVED), or null. */
  adminApprovedAt: z.string().nullable(),
  type: BookingTypeSchema,
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  durationHours: z.number(),
  baseRate: z.number(),
  /** base rate + selected skill add-on fees, per hour. */
  effectiveHourlyRate: z.number(),
  /** Selected per-skill add-ons applied to this booking. */
  skillAddOns: z.array(AppliedSkillFeeSchema),
  subtotal: z.number(),
  durationMultiplier: z.number(),
  discountAmount: z.number(),
  serviceFeePercent: z.number(),
  serviceFeeAmount: z.number(),
  totalAmount: z.number(),
  /** What the nanny earns from this booking (nannies only ever see this). */
  nannyAmount: z.number(),
  /** What the platform keeps from this booking. */
  platformAmount: z.number(),
  specialInstructions: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  nannyCheckedInAt: z.string().nullable(),
  nannyCheckedOutAt: z.string().nullable(),
  payment: BookingPaymentSummarySchema.nullable(),
  myReview: BookingMyReviewSchema.nullable(),
  createdAt: z.string(),
});
export type BookingResponse = z.infer<typeof BookingResponseSchema>;

export const EmergencyBookingResponseSchema = z.object({
  booking: BookingResponseSchema,
  nearbyNannies: z.array(NearbyNannySchema),
});
export type EmergencyBookingResponse = z.infer<typeof EmergencyBookingResponseSchema>;

// ── Request schemas ──────────────────────────────────────────────────────────

/**
 * Create a booking request. The mother no longer picks a nanny — the request is
 * broadcast to every eligible nanny and the first to accept claims it. Price is
 * known up front from the fixed platform rate, not a per-nanny rate. Optional
 * coordinates let the server order the broadcast pool by proximity.
 */
export const CreateBookingSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  specialInstructions: z.string().trim().max(1000).optional(),
  promoCode: z.string().trim().min(1).optional(),
  /** Ids of skills the mother selected as paid add-ons (e.g. "French speaker"). */
  skillIds: z.array(z.string()).default([]),
});
export type CreateBookingRequest = z.infer<typeof CreateBookingSchema>;

/** Preview a promo discount before booking. `subtotal` is baseRate × hours; the server adds the service fee. */
export const ValidateBookingPromoSchema = z.object({
  code: z.string().trim().min(1),
  subtotal: z.number().positive(),
});
export type ValidateBookingPromoRequest = z.infer<typeof ValidateBookingPromoSchema>;

export const ValidateBookingPromoResponseSchema = z.object({
  discountAmount: z.number(),
});
export type ValidateBookingPromoResponse = z.infer<typeof ValidateBookingPromoResponseSchema>;

/**
 * Public pricing inputs the booking form needs to show a live estimate before a
 * request is created: the base hourly rate, selectable skill add-ons and their
 * fees, duration discount tiers, and the nanny/platform revenue split.
 */
export const PricingConfigSchema = z.object({
  standardHourlyRate: z.number(),
  /** Legacy platform service fee — retained for back-compat; 0 under the split model. */
  serviceFeePercent: z.number(),
  /** Nanny's share of the total, in percent (nannyPercent + platformPercent = 100). */
  nannyPercent: z.number(),
  platformPercent: z.number(),
  /** Skills a mother can add as paid booking add-ons (feeType is non-null). */
  skillAddOns: z.array(PublicSkillSchema),
  /** Duration discount/surcharge tiers, ascending by minHours. */
  durationRules: z.array(PublicDurationRuleSchema),
});
export type PricingConfig = z.infer<typeof PricingConfigSchema>;

/** YYYY-MM-DD in local calendar time for the given instant. */
export function toLocalDateIso(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Standard bookings must be on a future calendar day — not today. */
export function isStandardBookingDateAllowed(dateIso: string, now: Date = new Date()): boolean {
  return dateIso > toLocalDateIso(now);
}

export const STANDARD_BOOKING_SAME_DAY_MESSAGE =
  'Standard bookings must be scheduled at least one day in advance. Use emergency booking for same-day care.';

export const CreateEmergencyBookingSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }),
});
export type CreateEmergencyBookingRequest = z.infer<typeof CreateEmergencyBookingSchema>;

export const CancelBookingSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type CancelBookingRequest = z.infer<typeof CancelBookingSchema>;

/** Demo-only: simulates payment success or failure without a real payment provider. */
export const MockPayBookingSchema = z.object({
  method: PaymentMethodSchema,
  succeed: z.boolean(),
});
export type MockPayBookingRequest = z.infer<typeof MockPayBookingSchema>;

/** Start a real Paymob unified checkout (intention) for a booking. */
export const CreatePaymobIntentionSchema = z.object({
  method: PaymentMethodSchema,
});
export type CreatePaymobIntentionRequest = z.infer<typeof CreatePaymobIntentionSchema>;

/** Minutes before scheduled start when nanny may check in (must match backend). */
export const CHECK_IN_EARLY_MINUTES = 15;

export const BookingListQuerySchema = z.object({
  /** Comma-separated statuses, e.g. "CONFIRMED,IN_PROGRESS" */
  status: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
  sortBy: z.enum(['date', 'startTime', 'createdAt']).default('date'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type BookingListQuery = z.infer<typeof BookingListQuerySchema>;

export const PaginationMetaSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
});
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;
