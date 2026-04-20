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
  cancellationReason: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  nannyCheckedInAt: z.string().nullable(),
  nannyCheckedOutAt: z.string().nullable(),
  payment: BookingPaymentSummarySchema.nullable(),
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
});
export type CreateBookingRequest = z.infer<typeof CreateBookingSchema>;

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

export const BookingListQuerySchema = z.object({
  /** Comma-separated statuses, e.g. "CONFIRMED,IN_PROGRESS" */
  status: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
  sortBy: z.enum(['date', 'createdAt']).default('date'),
});
export type BookingListQuery = z.infer<typeof BookingListQuerySchema>;

export const PaginationMetaSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
});
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;
