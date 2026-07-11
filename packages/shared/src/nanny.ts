import { z } from 'zod';

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

export const NannyApprovalStatusSchema = z.enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED']);
/** Enum-like const for value comparisons: `NannyApprovalStatus.APPROVED`, … */
export const NannyApprovalStatus = NannyApprovalStatusSchema.enum;
export type NannyApprovalStatus = z.infer<typeof NannyApprovalStatusSchema>;

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
  hourlyRate: z.number().nullable(),
  certifications: z.array(z.string()),
  ageRanges: z.array(z.string()),
  specialties: z.array(z.string()),
  schedule: WeeklyScheduleSchema.nullable(),
  isProfileComplete: z.boolean(),
  availabilityType: AvailabilityTypeSchema,
  rating: z.number(),
  reviewCount: z.number().int(),
});
export type NannyProfileResponse = z.infer<typeof NannyProfileResponseSchema>;

// ── Public nanny listing (used by GET /nannies) ──────────────────────────────

export const NannyListItemSchema = z.object({
  nannyProfileId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().nullable(),
  bio: z.string().nullable(),
  location: z.string().nullable(),
  yearsOfExperience: z.number().int().nullable(),
  hourlyRate: z.number().nullable(),
  certifications: z.array(z.string()),
  ageRanges: z.array(z.string()),
  specialties: z.array(z.string()),
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
  id: z.string(),
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
  specialty: z.string().trim().optional(),
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
  location: z.string().trim().max(200).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  yearsOfExperience: z.number().int().min(0).max(60).optional(),
  hourlyRate: z.number().min(0).optional(),
  certifications: z.array(z.string().max(100)).optional(),
  ageRanges: z.array(z.string()).optional(),
  specialties: z.array(z.string().max(100)).optional(),
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
