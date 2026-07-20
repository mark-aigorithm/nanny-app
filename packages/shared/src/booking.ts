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

export const BookingTypeSchema = z.enum(['STANDARD']);
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
  id: z.number().int(),
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
  nannyProfileId: z.number().int(),
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().nullable(),
  location: z.string().nullable(),
  /**
   * The nanny's contact number, exposed by the backend ONLY once the booking is
   * confirmed and the start time is within REVEAL_PHONE_EARLY_MINUTES (through
   * the end of the shift). Null at all other times — the number is never sent to
   * the client early. See REVEAL_PHONE_EARLY_MINUTES.
   */
  phone: z.string().nullable(),
});
export type NannySummary = z.infer<typeof NannySummarySchema>;

// ── Booking response ─────────────────────────────────────────────────────────

export const BookingPaymentSummarySchema = z.object({
  id: z.number().int(),
  status: PaymentStatusSchema,
  method: PaymentMethodSchema,
  amount: z.number(),
});

export const BookingMyReviewSchema = z.object({
  id: z.number().int(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  createdAt: z.string(),
});
export type BookingMyReview = z.infer<typeof BookingMyReviewSchema>;

export const BookingResponseSchema = z.object({
  id: z.number().int(),
  motherId: z.number().int(),
  motherFirstName: z.string(),
  motherLastName: z.string(),
  motherAvatarUrl: z.string().nullable(),
  nannyProfileId: z.number().int().nullable(),
  nanny: NannySummarySchema.nullable(),
  /**
   * Effective (admin-configured) minutes-before-start at which nanny.phone
   * unlocks — echoed so the client can show accurate "available N minutes before
   * start" copy and a countdown without holding the number early. See
   * NannySummary.phone and REVEAL_PHONE_EARLY_MINUTES.
   */
  nannyPhoneRevealMinutes: z.number().int(),
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
  /** Care Points applied to this booking before payment (0 when none). */
  rewardCreditHoursApplied: z.number(),
  rewardCreditPoints: z.number(),
  rewardCreditAmount: z.number(),
  specialInstructions: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  nannyCheckedInAt: z.string().nullable(),
  nannyCheckedOutAt: z.string().nullable(),
  /**
   * True when the parent has generated a still-valid start PIN. Lets the nanny
   * UI show "waiting for the parent" vs "enter the PIN". Never carries the PIN
   * itself — the raw code is only returned by POST /bookings/:id/start-pin.
   */
  startPinActive: z.boolean(),
  /**
   * True when the assigned nanny has a camera the parent could watch. Drives
   * the "Watch Live" button. Like startPinActive it signals availability only —
   * the stream URL itself comes from GET /bookings/:id/camera, which is gated
   * on the booking actually being IN_PROGRESS.
   */
  hasCamera: z.boolean(),
  payment: BookingPaymentSummarySchema.nullable(),
  myReview: BookingMyReviewSchema.nullable(),
  createdAt: z.string(),
});
export type BookingResponse = z.infer<typeof BookingResponseSchema>;

// ── Request schemas ──────────────────────────────────────────────────────────

/**
 * A wall-clock instant with no timezone: "2026-07-20T09:00:00". Deliberately a
 * regex rather than `z.string().datetime({ local: true })` — this must REJECT a
 * trailing offset. An older mobile build sending `…+00:00` was silently booking
 * 2-3 hours off; a hard 400 is the point.
 */
export const WALL_CLOCK_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

/** A wall-clock field named for its owner, so the 400 says which one is wrong. */
export function wallClockField(name: string): z.ZodString {
  return z
    .string()
    .regex(
      WALL_CLOCK_REGEX,
      `${name} must be a wall-clock time (YYYY-MM-DDTHH:mm:ss) with no timezone offset`,
    );
}

/**
 * Create a booking request. The mother no longer picks a nanny — the request is
 * broadcast to every eligible nanny and the first to accept claims it. Price is
 * known up front from the fixed platform rate, not a per-nanny rate. Optional
 * coordinates let the server order the broadcast pool by proximity.
 *
 * Times are wall-clock in `PLATFORM_TIMEZONE` — the literal time the parent
 * picked. The server converts to UTC and derives the booking's `date` from the
 * start, so the client cannot send a `date` that disagrees with `startTime`.
 */
export const CreateBookingSchema = z.object({
  startTime: wallClockField('startTime'),
  endTime: wallClockField('endTime'),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  specialInstructions: z.string().trim().max(1000).optional(),
  promoCode: z.string().trim().min(1).optional(),
  /** Ids of skills the mother selected as paid add-ons (e.g. "French speaker"). */
  skillIds: z.array(z.number().int()).default([]),
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

/**
 * What the booking date/time picker needs to decide which slots to offer. Kept
 * separate from PricingConfig: these aren't pricing inputs, PricingConfig is
 * also served to the admin's pricing calculator, and the picker needs these one
 * step before the pricing screen needs those.
 */
export const BookingOptionsSchema = z.object({
  /** First hour care may start, and the hour it must end by. See bookingWindowLengthHours. */
  bookingWindowStartHour: z.number().int().min(0).max(23),
  bookingWindowEndHour: z.number().int().min(0).max(23),
  minBookingHours: z.number().int(),
  maxBookingHours: z.number().int(),
  minAdvanceBookingHours: z.number().int(),
  /** IANA zone every wall-clock time on this payload is expressed in. */
  timezone: z.string(),
  /** Server "now" as a wall-clock time, e.g. "2026-07-15T14:32:07". */
  nowWallClock: z.string(),
  /**
   * `now + minAdvanceBookingHours` as wall-clock, UNROUNDED. A slot is bookable
   * iff `slotStartWall >= earliestStartWallClock` — fixed-width wall-clock
   * strings compare lexicographically, so the client needs no timezone database
   * and never has to trust the device clock. Leaving it unrounded is
   * conservative (16:37 excludes the 16:00 slot, offers 17:00), and the server
   * re-checks real instants regardless.
   */
  earliestStartWallClock: z.string(),
});
export type BookingOptions = z.infer<typeof BookingOptionsSchema>;

// ── Daily booking window ─────────────────────────────────────────────────────
// The admin configures the hours of the day care may be booked. Both bounds are
// wall-clock hours in PLATFORM_TIMEZONE. These checks are pure wall-clock
// arithmetic — no timezone database, no instants — so the backend runs them on
// the raw request strings before converting, and the mobile picker uses the very
// same rules to decide what to offer. Modelled on the availability-window
// helpers in `nanny.ts`.

const MINUTES_PER_DAY = 1440;
const MS_PER_DAY = 86_400_000;

function isWindowHour(hour: number): boolean {
  return Number.isInteger(hour) && hour >= 0 && hour <= 23;
}

/**
 * How many hours the daily window spans.
 *
 * `endHour <= startHour` means the window runs past midnight and closes on the
 * NEXT day — 8 → 2 is 08:00 to 02:00 (18 hours). `endHour === startHour` is the
 * full 24-hour case, i.e. no restriction.
 */
export function bookingWindowLengthHours(startHour: number, endHour: number): number {
  return endHour > startHour ? endHour - startHour : endHour + 24 - startHour;
}

type WallClockParts = {
  /** Whole days since the epoch — lets us diff dates without touching offsets. */
  dayEpoch: number;
  /** Minutes from that day's midnight. */
  minutes: number;
};

/** Parses "YYYY-MM-DDTHH:mm:ss", or null when malformed or not a real date. */
function parseWallClock(wall: string): WallClockParts | null {
  if (!WALL_CLOCK_REGEX.test(wall)) return null;
  const year = Number(wall.slice(0, 4));
  const month = Number(wall.slice(5, 7));
  const day = Number(wall.slice(8, 10));
  const hours = Number(wall.slice(11, 13));
  const minutes = Number(wall.slice(14, 16));
  if (hours > 23 || minutes > 59) return null;

  const utcMs = Date.UTC(year, month - 1, day);
  const back = new Date(utcMs);
  // Date.UTC rolls over (Feb 30 → Mar 2); round-trip so we reject impossible dates.
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() !== month - 1 ||
    back.getUTCDate() !== day
  ) {
    return null;
  }
  return { dayEpoch: utcMs / MS_PER_DAY, minutes: hours * 60 + minutes };
}

/**
 * True when a booking running `startWall` → `endWall` fits inside the daily
 * window. Both are wall-clock strings; `endWall` carries its own date, so a
 * booking that ends after midnight is expressed naturally.
 *
 * Everything is measured in minutes from the CARE-DAY's midnight, which is what
 * makes the cross-midnight case fall out: a booking starting before the window
 * opens belongs to the previous care-day, so it's shifted forward a day and then
 * compared against the same bounds. Fails closed on malformed input.
 */
export function isBookingWithinDailyWindow(
  startWall: string,
  endWall: string,
  startHour: number,
  endHour: number,
): boolean {
  const start = parseWallClock(startWall);
  const end = parseWallClock(endWall);
  if (!start || !end) return false;
  if (!isWindowHour(startHour) || !isWindowHour(endHour)) return false;

  const windowStart = startHour * 60;
  const windowMinutes = bookingWindowLengthHours(startHour, endHour) * 60;

  let offsetStart = start.minutes;
  let offsetEnd = (end.dayEpoch - start.dayEpoch) * MINUTES_PER_DAY + end.minutes;
  if (offsetEnd <= offsetStart) return false;

  // A full-24h window restricts nothing beyond ordering.
  if (windowMinutes >= MINUTES_PER_DAY) return true;

  if (offsetStart < windowStart) {
    offsetStart += MINUTES_PER_DAY;
    offsetEnd += MINUTES_PER_DAY;
  }
  return offsetStart >= windowStart && offsetEnd <= windowStart + windowMinutes;
}

function formatWindowHour(hour: number): string {
  const suffix = hour < 12 ? 'am' : 'pm';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${suffix}`;
}

/** Rejection message when a booking falls outside the configured daily window. */
export function bookingWindowMessage(startHour: number, endHour: number): string {
  return `Bookings must run between ${formatWindowHour(startHour)} and ${formatWindowHour(endHour)}.`;
}

/** Rejection message when a booking doesn't meet the configured lead time. */
export function bookingLeadTimeMessage(minAdvanceHours: number): string {
  if (minAdvanceHours <= 0) return 'Cannot book in the past.';
  const plural = minAdvanceHours === 1 ? 'hour' : 'hours';
  return `Bookings must be made at least ${minAdvanceHours} ${plural} in advance.`;
}

// ── Care-day slots ───────────────────────────────────────────────────────────

/** YYYY-MM-DD shifted by whole days. UTC arithmetic, so DST can't skew it. */
export function addDaysIso(dateIso: string, days: number): string {
  const year = Number(dateIso.slice(0, 4));
  const month = Number(dateIso.slice(5, 7));
  const day = Number(dateIso.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * The wall-clock time `absHour` hours after `careDayIso` 00:00. `absHour` may
 * exceed 23, in which case the result lands on a later date — that's how an
 * after-midnight slot gets the next day's date while still being offered under
 * the care-day the parent tapped.
 */
export function careDayWallClock(careDayIso: string, absHour: number): string {
  const dateIso = addDaysIso(careDayIso, Math.floor(absHour / 24));
  const hour = ((absHour % 24) + 24) % 24;
  return `${dateIso}T${String(hour).padStart(2, '0')}:00:00`;
}

/**
 * A bookable start time offered under a care-day. `absHour` is hours since the
 * care-day's midnight (so it sorts correctly and can exceed 23); `hour` is the
 * wall-clock hour to label it with; `dateIso` is the calendar date it truly
 * falls on, which for a late-night slot is the day AFTER the one tapped.
 */
export type CareDaySlot = {
  absHour: number;
  hour: number;
  dateIso: string;
  startWall: string;
};

/**
 * Every start time offered for a care-day, in chronological order. A slot is
 * only offered if the shortest permitted booking still fits before the window
 * closes, so the last few hours of the window never appear as dead options.
 */
export function generateCareDaySlots(
  careDayIso: string,
  startHour: number,
  endHour: number,
  minBookingHours: number,
): CareDaySlot[] {
  if (!isWindowHour(startHour) || !isWindowHour(endHour)) return [];
  const windowLength = bookingWindowLengthHours(startHour, endHour);
  const slots: CareDaySlot[] = [];
  for (let offset = 0; offset + minBookingHours <= windowLength; offset++) {
    const absHour = startHour + offset;
    slots.push({
      absHour,
      hour: absHour % 24,
      dateIso: addDaysIso(careDayIso, Math.floor(absHour / 24)),
      startWall: careDayWallClock(careDayIso, absHour),
    });
  }
  return slots;
}

export const CancelBookingSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type CancelBookingRequest = z.infer<typeof CancelBookingSchema>;

/** Nanny check-in body — the 4-digit start PIN the parent revealed. */
export const CheckInBookingSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'PIN must be 4 digits'),
});
export type CheckInBookingRequest = z.infer<typeof CheckInBookingSchema>;

/** Parent-only response from POST /bookings/:id/start-pin — the plaintext PIN, returned once. */
export const GenerateStartPinResponseSchema = z.object({
  pin: z.string(),
  expiresAt: z.string(),
});
export type GenerateStartPinResponse = z.infer<typeof GenerateStartPinResponseSchema>;

/** Demo-only: simulates payment success or failure without a real payment provider. */
export const MockPayBookingSchema = z.object({
  method: PaymentMethodSchema,
  succeed: z.boolean(),
});
export type MockPayBookingRequest = z.infer<typeof MockPayBookingSchema>;

/**
 * Apply Care Points against a booking before payment. Redeems this many hours
 * of the booking, lowering the amount the parent is charged. Points are
 * refunded if the payment is not completed (failure or cancellation).
 */
export const RedeemBookingPointsSchema = z.object({
  hours: z.number().int().min(1).max(24),
});
export type RedeemBookingPointsRequest = z.infer<typeof RedeemBookingPointsSchema>;

/** Start a real Paymob unified checkout (intention) for a booking. */
export const CreatePaymobIntentionSchema = z.object({
  method: PaymentMethodSchema,
});
export type CreatePaymobIntentionRequest = z.infer<typeof CreatePaymobIntentionSchema>;

/** Minutes before scheduled start when nanny may check in (must match backend). */
export const CHECK_IN_EARLY_MINUTES = 15;

/**
 * Minutes before scheduled start when the nanny's phone number is revealed to
 * the parent on a confirmed booking (through the end of the shift). The backend
 * gates NannySummary.phone on this window; the mobile card mirrors it for its
 * "will appear 45 minutes before start" messaging (must match backend).
 */
export const REVEAL_PHONE_EARLY_MINUTES = 45;

/** How long a parent-generated start PIN stays valid (must match backend). */
export const START_PIN_TTL_MINUTES = 20;

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
