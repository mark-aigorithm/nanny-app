import { z } from 'zod';

// ──────────────────────────────────────────────────────────────
// Booking — shared Zod schemas
// ──────────────────────────────────────────────────────────────

export const BookingStatusSchema = z.enum([
  'PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REFUNDED',
]);
export const BookingStatus = BookingStatusSchema.enum;
export type BookingStatus = z.infer<typeof BookingStatusSchema>;

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

export const PriceBreakdownSchema = z.object({
  baseRate: z.number(),
  durationHours: z.number(),
  subtotal: z.number(),
  discountAmount: z.number(),
  serviceFeePercent: z.number(),
  serviceFeeAmount: z.number(),
  totalAmount: z.number(),
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
  type: BookingTypeSchema,
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  durationHours: z.number(),
  baseRate: z.number(),
  subtotal: z.number(),
  discountAmount: z.number(),
  serviceFeePercent: z.number(),
  serviceFeeAmount: z.number(),
  totalAmount: z.number(),
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

export const CreateBookingSchema = z.object({
  nannyProfileId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }),
  specialInstructions: z.string().trim().max(1000).optional(),
});
export type CreateBookingRequest = z.infer<typeof CreateBookingSchema>;

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
