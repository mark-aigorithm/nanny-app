import { z } from 'zod';

import {
  AvailabilityTypeSchema,
  IdDocumentTypeSchema,
  WeeklyScheduleSchema,
  idTypeRequiresBack,
} from './nanny';

// ──────────────────────────────────────────────────────────────
// Auth — shared Zod schemas
// ──────────────────────────────────────────────────────────────
// These schemas are the single source of truth for auth payloads
// flowing between mobile and backend. Both sides must use the
// inferred TypeScript types so required/optional stays in sync.
// ──────────────────────────────────────────────────────────────

export const RoleSchema = z.enum(['MOTHER', 'NANNY']);
/** Enum-like const for value comparisons: `Role.NANNY`, `Role.MOTHER`. */
export const Role = RoleSchema.enum;
export type Role = z.infer<typeof RoleSchema>;

/**
 * An email address as it is accepted anywhere in the auth surface. Trimmed and
 * lowercased so the same address always hashes, matches and rate-limits the
 * same way regardless of how the user capitalised it.
 */
const EmailSchema = z.string().trim().toLowerCase().email();

/** A 6-digit one-time code, as a string so leading zeros survive. */
const OtpCodeSchema = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.');

/** Body for POST /auth/email/otp — sends a one-time code to the address. */
export const SendEmailOtpSchema = z.object({ email: EmailSchema });
export type SendEmailOtpRequest = z.infer<typeof SendEmailOtpSchema>;

/** Body for POST /auth/email/verify — swaps a correct code for a one-time token. */
export const VerifyEmailOtpSchema = z.object({ email: EmailSchema, code: OtpCodeSchema });
export type VerifyEmailOtpRequest = z.infer<typeof VerifyEmailOtpSchema>;

/**
 * Result of a successful code check. The token is the proof carried across the
 * unauthenticated boundary: a nanny spends it on POST /auth/register, a mother
 * on POST /auth/email. Single-use and short-lived.
 */
export const VerifyEmailOtpResponseSchema = z.object({
  verificationToken: z.string(),
  /** ISO datetime after which the token can no longer be spent. */
  expiresAt: z.string(),
});
export type VerifyEmailOtpResponse = z.infer<typeof VerifyEmailOtpResponseSchema>;

/** Body for POST /auth/email — an existing user attaches a proven address. */
export const SetVerifiedEmailSchema = z.object({
  email: EmailSchema,
  verificationToken: z.string().min(1),
});
export type SetVerifiedEmailRequest = z.infer<typeof SetVerifiedEmailSchema>;

/**
 * A phone number as the auth surface stores and compares it: E.164, nothing
 * else. `users.phone` is unique on exactly this string, so every body that
 * carries a phone must normalise to it or a lookup will miss.
 */
export const PhoneE164Schema = z
  .string()
  .trim()
  .regex(/^\+\d{7,15}$/, 'phone must be E.164, e.g. +15551234567');

/**
 * Body for POST /auth/availability — asked from step 1 of the wizard, before
 * anything is sent or created, so a taken email or phone is refused while the
 * fields are still on screen rather than at the end of the wizard.
 */
export const CheckAvailabilitySchema = z.object({ email: EmailSchema, phone: PhoneE164Schema });
export type CheckAvailabilityRequest = z.infer<typeof CheckAvailabilitySchema>;

/**
 * A true flag means POST /auth/register would refuse that value with a 409.
 * Both can be true at once; the client reports each under its own field.
 */
export const AvailabilityResponseSchema = z.object({
  emailTaken: z.boolean(),
  phoneTaken: z.boolean(),
});
export type AvailabilityResponse = z.infer<typeof AvailabilityResponseSchema>;

/** Body for POST /auth/register — fields not in Firebase. */
export const RegisterRequestSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    // Email is also on the Firebase token, but we accept and validate it here
    // so the backend doesn't have to derive it from the JWT for the insert.
    email: EmailSchema,
    // Proof from POST /auth/email/verify that this address belongs to whoever
    // is registering. Both roles prove their address mid-wizard, so no account
    // is ever created with an unproven one — which is what lets receipts,
    // payment records and account recovery rely on `users.email`.
    emailVerificationToken: z.string().min(1, 'Please verify your email address before finishing sign-up.'),
    phone: PhoneE164Schema,
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must be YYYY-MM-DD'),
    role: RoleSchema,
    termsAcceptedVersion: z.string().min(1),
    address: z.string().trim().max(200).optional(),
    // Home coordinates from the registration map picker — required so
    // proximity search / distance sorting work for every account.
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    // The nanny's ID document (Firebase Storage download URLs) + its type,
    // captured at registration for admin KYC review. Mothers omit these; the
    // refine below makes them mandatory for nannies. A passport needs only the
    // front image; a national ID needs both sides.
    idDocumentType: IdDocumentTypeSchema.optional(),
    idDocumentFrontUrl: z.string().url().optional(),
    idDocumentBackUrl: z.string().url().optional(),
    // Nanny profile fields captured at registration. Mothers omit these; the
    // refines below make everything but certifications and skills mandatory
    // for nannies — registration is the only time she enters her profile.
    avatarUrl: z.string().url().optional(),
    bio: z.string().trim().max(600).optional(),
    yearsOfExperience: z.number().int().min(0).max(60).optional(),
    ageRanges: z.array(z.string()).optional(),
    availabilityType: AvailabilityTypeSchema.optional(),
    schedule: WeeklyScheduleSchema.optional(),
    certificationIds: z.array(z.number().int().positive()).optional(),
    skillIds: z.array(z.number().int().positive()).optional(),
  })
  .refine(
    (v) =>
      v.role !== 'NANNY' ||
      (!!v.idDocumentType &&
        !!v.idDocumentFrontUrl &&
        (!idTypeRequiresBack(v.idDocumentType) || !!v.idDocumentBackUrl)),
    {
      message: 'Nannies must upload a valid ID (both sides for a national ID).',
      path: ['idDocumentFrontUrl'],
    },
  )
  .refine(
    (v) =>
      v.role !== 'NANNY' ||
      (!!v.avatarUrl && !!v.bio && v.yearsOfExperience !== undefined && !!v.availabilityType),
    {
      message: 'Nannies must provide a photo, bio, years of experience, and availability.',
      path: ['bio'],
    },
  )
  .refine((v) => v.role !== 'NANNY' || !!v.address, {
    message: 'Please enter your street address.',
    path: ['address'],
  })
  .refine((v) => v.role !== 'NANNY' || (v.ageRanges?.length ?? 0) > 0, {
    message: 'Please pick at least one age range you care for.',
    path: ['ageRanges'],
  })
  .refine(
    (v) =>
      v.role !== 'NANNY' ||
      Object.values(v.schedule ?? {}).some((day) => day.available),
    {
      message: 'Please mark at least one day you can work.',
      path: ['schedule'],
    },
  );
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

/**
 * Body for POST /auth/id — a user (re)submits their identity document outside of
 * registration: a nanny re-uploading after a reject, or a mother uploading before
 * her first booking. Moves the account to PENDING_REVIEW for admin KYC.
 */
export const SubmitIdRequestSchema = z
  .object({
    idDocumentType: IdDocumentTypeSchema,
    idDocumentFrontUrl: z.string().url(),
    idDocumentBackUrl: z.string().url().optional(),
  })
  .refine((v) => !idTypeRequiresBack(v.idDocumentType) || !!v.idDocumentBackUrl, {
    message: 'A national ID requires both sides.',
    path: ['idDocumentBackUrl'],
  });
export type SubmitIdRequest = z.infer<typeof SubmitIdRequestSchema>;

/**
 * Admin approval state of an account, for BOTH roles (lives on `users`).
 * - PENDING_ID: no usable ID on file — the user must (re)upload one.
 * - PENDING_REVIEW: waiting for an admin decision.
 * - APPROVED: a parent's ID checked out; a nanny's whole application
 *   (profile + ID) was reviewed and accepted — she is visible to parents.
 * - REJECTED: an admin refused it; the ID images were deleted and a reason
 *   stored, so the user must upload a new ID to be reviewed again.
 * Gate predicate (both roles): needs an upload when PENDING_ID or REJECTED.
 */
export const ApprovalStatusSchema = z.enum([
  'PENDING_ID',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
]);
/** Enum-like const for value comparisons: `ApprovalStatus.APPROVED`, … */
export const ApprovalStatus = ApprovalStatusSchema.enum;
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

/** Shape returned by /auth/me and /auth/register. Mirrors Prisma `User` minus internal fields. */
export const UserResponseSchema = z.object({
  id: z.number().int(),
  firebaseUid: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  firstName: z.string(),
  lastName: z.string(),
  dateOfBirth: z.string().nullable(), // ISO date string
  avatarUrl: z.string().nullable(),
  role: RoleSchema.nullable(),
  isEmailVerified: z.boolean(),
  isPhoneVerified: z.boolean(),
  /** Admin approval state (nannies and mothers). Null for admins/role-less. */
  approvalStatus: ApprovalStatusSchema.nullable(),
  /** Kind of ID on file, if any. Null until the user uploads one. */
  idDocumentType: IdDocumentTypeSchema.nullable(),
  /** Reason an admin gave when rejecting, surfaced in the forced re-upload prompt. */
  rejectionReason: z.string().nullable(),
  address: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  createdAt: z.string(), // ISO datetime
});
export type UserResponse = z.infer<typeof UserResponseSchema>;

/** Body for PATCH /auth/me — all fields optional (patch semantics). */
export const UpdateProfileRequestSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+\d{7,15}$/, 'phone must be E.164, e.g. +15551234567')
    .nullable()
    .optional(),
  avatarUrl: z.string().url().nullable().optional(),
  // Home location lives on the user row (single source of truth for proximity
  // search). Updating address + coordinates together here is what keeps the
  // saved home in sync with the map pin and prevents distance-sort drift.
  address: z.string().trim().max(200).nullable().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

/** Standard API envelope used by every backend response (success and error). */
export const ApiSuccessSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ data, error: z.null() });

export const ApiErrorSchema = z.object({
  data: z.null(),
  error: z.string(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export type ApiResponse<T> = { data: T; error: null } | { data: null; error: string };
