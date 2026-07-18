import { z } from 'zod';

import { PublicSkillSchema } from './skill';

// ──────────────────────────────────────────────────────────────
// Nanny profile — shared Zod schemas
// ──────────────────────────────────────────────────────────────

export const DayScheduleSchema = z.object({
  available: z.boolean(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'startTime must be HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'endTime must be HH:MM'),
});
export type DaySchedule = z.infer<typeof DayScheduleSchema>;

/** Keys are day-of-week numbers as strings: "0" = Sun … "6" = Sat. */
export const WeeklyScheduleSchema = z.record(z.string(), DayScheduleSchema);
export type WeeklySchedule = z.infer<typeof WeeklyScheduleSchema>;

// ── Availability-window validation ────────────────────────────────────────────
// Define-once rules for checking a requested booking time against a nanny's
// weekly availability. Pure and framework-free so the mobile app (and, later,
// the backend) can share the exact same logic. All times are minutes-from-
// midnight under the same wall-clock convention the booking screen uses.

/**
 * Parse an "HH:MM" clock string into minutes-from-midnight. Honours minutes
 * (e.g. "17:30" → 1050). Returns `NaN` for malformed input so callers fail
 * closed rather than treating garbage as `0`.
 */
function parseHhMmToMinutes(time: string): number {
  const [hh, mm] = time.split(':');
  const hours = Number(hh);
  const minutes = Number(mm);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return Number.NaN;
  return hours * 60 + minutes;
}

/**
 * The available window length (in minutes) for a given day-of-week, or `null`
 * when the day is missing, unavailable, or has malformed bounds.
 * `dayOfWeek` is 0 (Sun) … 6 (Sat), matching JS `Date.getDay()`.
 */
export function getDayScheduleWindowMinutes(
  schedule: WeeklySchedule | null | undefined,
  dayOfWeek: number,
): number | null {
  if (!schedule) return null;
  const day = schedule[String(dayOfWeek)];
  if (!day || !day.available) return null;
  const start = parseHhMmToMinutes(day.startTime);
  const end = parseHhMmToMinutes(day.endTime);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return end - start;
}

/**
 * True when a booking spanning `[startMinutes, endMinutes]` (minutes-from-
 * midnight) fits entirely within the nanny's available window for `dayOfWeek`.
 *
 * - `false` when the day is missing or `available === false`.
 * - Window bounds honour minutes (e.g. "17:30" → 1050), not just the hour.
 * - Exact-edge is VALID: a booking ending exactly at the window end (or
 *   starting exactly at the window start) passes.
 */
export function isTimeRangeWithinDaySchedule(
  schedule: WeeklySchedule | null | undefined,
  dayOfWeek: number,
  startMinutes: number,
  endMinutes: number,
): boolean {
  if (!schedule) return false;
  const day = schedule[String(dayOfWeek)];
  if (!day || !day.available) return false;
  const windowStart = parseHhMmToMinutes(day.startTime);
  const windowEnd = parseHhMmToMinutes(day.endTime);
  if (Number.isNaN(windowStart) || Number.isNaN(windowEnd)) return false;
  return startMinutes >= windowStart && endMinutes <= windowEnd;
}

/**
 * Convenience for the booking screen: does a booking starting at `startMinutes`
 * and running for `durationHours` fit within the day's available window?
 */
export function doesDurationFitDaySchedule(
  schedule: WeeklySchedule | null | undefined,
  dayOfWeek: number,
  startMinutes: number,
  durationHours: number,
): boolean {
  return isTimeRangeWithinDaySchedule(
    schedule,
    dayOfWeek,
    startMinutes,
    startMinutes + durationHours * 60,
  );
}

/** Shown when the chosen start + duration runs past the nanny's available window. */
export const BOOKING_OUTSIDE_AVAILABILITY_MESSAGE =
  "This time is outside the nanny's available hours.";

/** Shown when the day's window can't fit even the shortest booking option. */
export const BOOKING_DAY_TOO_SHORT_MESSAGE =
  "This nanny isn't available long enough on this day.";

/** Shown when no booking length fits from the chosen start time — pick an earlier slot. */
export const BOOKING_START_TOO_LATE_MESSAGE =
  'No booking length fits from this start time. Try an earlier slot.';

export const NannyApprovalStatusSchema = z.enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED']);
/** Enum-like const for value comparisons: `NannyApprovalStatus.APPROVED`, … */
export const NannyApprovalStatus = NannyApprovalStatusSchema.enum;
export type NannyApprovalStatus = z.infer<typeof NannyApprovalStatusSchema>;

/**
 * Identity-verification state, shared by nannies AND mothers (lives on `users`).
 * - PENDING_ID: no usable ID on file — the user must (re)upload one.
 * - PENDING_REVIEW: ID uploaded, awaiting admin KYC review.
 * - APPROVED: admin verified the ID.
 * - REJECTED: admin rejected it; images were deleted and a reason stored.
 * Gate predicate (both roles): needs (re)upload when status is PENDING_ID or REJECTED.
 */
export const IdVerificationStatusSchema = z.enum([
  'PENDING_ID',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
]);
/** Enum-like const for value comparisons: `IdVerificationStatus.APPROVED`, … */
export const IdVerificationStatus = IdVerificationStatusSchema.enum;
export type IdVerificationStatus = z.infer<typeof IdVerificationStatusSchema>;

/**
 * Kind of government ID a user uploaded. A PASSPORT needs only the front image;
 * a NATIONAL_ID needs both front and back.
 */
export const IdDocumentTypeSchema = z.enum(['PASSPORT', 'NATIONAL_ID']);
/** Enum-like const for value comparisons: `IdDocumentType.PASSPORT`, … */
export const IdDocumentType = IdDocumentTypeSchema.enum;
export type IdDocumentType = z.infer<typeof IdDocumentTypeSchema>;

/** True when the ID document type requires a back image (national ID, not passport). */
export function idTypeRequiresBack(type: IdDocumentType): boolean {
  return type === 'NATIONAL_ID';
}

export const AvailabilityTypeSchema = z.enum(['FULL_TIME', 'PART_TIME', 'OCCASIONAL']);
export const AvailabilityType = AvailabilityTypeSchema.enum;
export type AvailabilityType = z.infer<typeof AvailabilityTypeSchema>;

/** Shape returned by GET /nanny/profile and PUT /nanny/profile. */
export const NannyProfileResponseSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().nullable(),
  bio: z.string().nullable(),
  location: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  yearsOfExperience: z.number().int().nullable(),
  certifications: z.array(z.string()),
  ageRanges: z.array(z.string()),
  skills: z.array(PublicSkillSchema),
  schedule: WeeklyScheduleSchema.nullable(),
  isProfileComplete: z.boolean(),
  availabilityType: AvailabilityTypeSchema,
  rating: z.number(),
  reviewCount: z.number().int(),
});
export type NannyProfileResponse = z.infer<typeof NannyProfileResponseSchema>;

// ── Profile visibility / completeness ────────────────────────────────────────

/**
 * The fields a nanny must fill in before her profile is visible to parents in
 * search, in the order they should be surfaced to her. Single source of truth
 * for the completeness rule — consumed by the backend (to set
 * `isProfileComplete`) and the mobile app (to explain what's missing).
 */
export const NANNY_VISIBILITY_REQUIRED_FIELDS = [
  { key: 'bio', label: 'Bio' },
  { key: 'location', label: 'Location' },
  { key: 'yearsOfExperience', label: 'Years of experience' },
] as const;

/** Union of the field keys that gate profile visibility. */
export type NannyVisibilityFieldKey = (typeof NANNY_VISIBILITY_REQUIRED_FIELDS)[number]['key'];

/** A required field paired with its human-readable label. */
export type NannyVisibilityField = (typeof NANNY_VISIBILITY_REQUIRED_FIELDS)[number];

/** Just the visibility-gating fields, all nullable — the input to the rule. */
export type NannyProfileCompletenessInput = Pick<
  NannyProfileResponse,
  NannyVisibilityFieldKey
>;

/**
 * Returns the visibility-gating fields that are still missing, in the order of
 * `NANNY_VISIBILITY_REQUIRED_FIELDS`. An empty array means the profile is
 * complete (and therefore shown to parents).
 *
 * Truthiness rules (must match the backend's historical behaviour exactly):
 * - `bio` / `location`: missing when falsy (null, undefined or empty string).
 * - `yearsOfExperience`: missing only when null/undefined — a value of `0`
 *   counts as present.
 */
export function getMissingNannyProfileFields(
  profile: NannyProfileCompletenessInput,
): NannyVisibilityField[] {
  return NANNY_VISIBILITY_REQUIRED_FIELDS.filter((field) => {
    const value = profile[field.key];
    if (field.key === 'bio' || field.key === 'location') {
      return !value; // falsy → missing (covers null, undefined, '')
    }
    return value == null; // numbers: only null/undefined is missing (0 is present)
  });
}

/** True when none of the visibility-gating fields are missing. */
export const isNannyProfileComplete = (profile: NannyProfileCompletenessInput): boolean =>
  getMissingNannyProfileFields(profile).length === 0;

// ── Public nanny listing (used by GET /nannies) ──────────────────────────────

export const NannyListItemSchema = z.object({
  nannyProfileId: z.number().int(),
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().nullable(),
  bio: z.string().nullable(),
  location: z.string().nullable(),
  yearsOfExperience: z.number().int().nullable(),
  certifications: z.array(z.string()),
  ageRanges: z.array(z.string()),
  skills: z.array(PublicSkillSchema),
  availabilityType: AvailabilityTypeSchema,
  rating: z.number(),
  reviewCount: z.number().int(),
  /**
   * Distance in kilometres from the coordinates passed in the list query,
   * rounded to one decimal. `null` when the nanny has no saved coordinates;
   * omitted entirely when the query had no `latitude`/`longitude`.
   */
  distanceKm: z.number().nullable().optional(),
});
export type NannyListItem = z.infer<typeof NannyListItemSchema>;

export const ReviewSummarySchema = z.object({
  id: z.number().int(),
  motherFirstName: z.string(),
  motherLastName: z.string(),
  motherAvatarUrl: z.string().nullable(),
  rating: z.number().int(),
  comment: z.string().nullable(),
  createdAt: z.string(),
});
export type ReviewSummary = z.infer<typeof ReviewSummarySchema>;

export const NannyPublicProfileSchema = NannyListItemSchema.extend({
  schedule: WeeklyScheduleSchema.nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  recentReviews: z.array(ReviewSummarySchema),
});
export type NannyPublicProfile = z.infer<typeof NannyPublicProfileSchema>;

export const NannyListQuerySchema = z.object({
  availabilityType: AvailabilityTypeSchema.optional(),
  name: z.string().trim().optional(),
  skillId: z.coerce.number().int().positive().optional(),
  /**
   * Caller (mother) coordinates. When both are provided, results are ranked
   * "recommended"-style: closest first, then highest-rated. Must be sent
   * together — one without the other is ignored and the list falls back to
   * rating order.
   */
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});
export type NannyListQuery = z.infer<typeof NannyListQuerySchema>;

/** Body for PUT /nanny/profile — all fields optional (patch semantics). */
export const UpdateNannyProfileRequestSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  bio: z.string().max(1000).optional(),
  // Free-text home label. Persisted to `users.address` (the single source of
  // truth); coordinates are edited via PATCH /auth/me, not here.
  location: z.string().trim().max(200).optional(),
  yearsOfExperience: z.number().int().min(0).max(60).optional(),
  certifications: z.array(z.string().max(100)).optional(),
  ageRanges: z.array(z.string()).optional(),
  schedule: WeeklyScheduleSchema.optional(),
  availabilityType: AvailabilityTypeSchema.optional(),
});
export type UpdateNannyProfileRequest = z.infer<typeof UpdateNannyProfileRequestSchema>;

// ── Booked-slots query ────────────────────────────────────────────────────────

export const NannyBookedSlotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});
export type NannyBookedSlotsQuery = z.infer<typeof NannyBookedSlotsQuerySchema>;

// ── Dashboard ─────────────────────────────────────────────────────────────────

export const NannyDashboardSchema = z.object({
  earningsThisWeek: z.number(),
  earningsThisMonth: z.number(),
  totalBookings: z.number().int(),
  repeatClients: z.number().int(),
  averageRating: z.number(),
  responseRate: z.number(),
});
export type NannyDashboard = z.infer<typeof NannyDashboardSchema>;

// ── Review ───────────────────────────────────────────────────────────────────

export const CreateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});
export type CreateReviewRequest = z.infer<typeof CreateReviewSchema>;
