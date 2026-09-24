import { z } from 'zod';

import {
  AgeRangeSchema,
  AvailabilityTypeSchema,
  IdDocumentTypeSchema,
  WeeklyScheduleSchema,
  idTypeRequiresBack,
} from './nanny';
import { platformToday } from './platform';

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
 * Body for POST /auth/reclaim-email — an unfinished (row-less) account proves
 * it now owns an address that another unfinished account is still squatting,
 * so it can take over that account's Firebase identity before registering.
 */
export const ReclaimEmailRequestSchema = z.object({
  email: EmailSchema,
  emailVerificationToken: z.string().min(1),
});
export type ReclaimEmailRequest = z.infer<typeof ReclaimEmailRequestSchema>;

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

/** Nobody under this age may hold an account — mother or nanny. */
export const MIN_REGISTRATION_AGE = 18;
/** Past this, a birth date is a typo (a wrong century), not a person. */
export const MAX_REGISTRATION_AGE = 100;

const UNDERAGE_MESSAGE = `You must be at least ${MIN_REGISTRATION_AGE} to use NannyNow.`;
const INVALID_DOB_MESSAGE = 'Please enter a valid date of birth.';

/**
 * Whole years between an ISO `YYYY-MM-DD` birth date and `today`'s calendar
 * date, turning over on the birthday itself. Null for anything that is not a
 * real date — `2001-02-30` included, which `new Date` would quietly roll over.
 *
 * Defaults `today` to Cairo's calendar date, not the caller's clock — see
 * `platformToday` — so a server running in UTC doesn't refuse someone turning
 * 18 today in the one market this app serves.
 */
export function ageOn(dateOfBirth: string, today: Date = platformToday()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  const todayMonth = today.getMonth() + 1;
  const hadBirthday = todayMonth > month || (todayMonth === month && today.getDate() >= day);
  return today.getFullYear() - year - (hadBirthday ? 0 : 1);
}

/**
 * The latest birth date that is MIN_REGISTRATION_AGE today — the date picker's
 * upper bound. On 29 February it is 28 February, since the target year has no
 * leap day and `new Date` would roll forward into March (one day too young).
 */
export function latestAllowedDob(today: Date = platformToday()): Date {
  const latest = new Date(today.getFullYear() - MIN_REGISTRATION_AGE, today.getMonth(), today.getDate());
  if (latest.getMonth() !== today.getMonth()) latest.setDate(0);
  return latest;
}

/** What is wrong with a birth date, in the words both the app and the API show — or null. */
export function dateOfBirthError(dateOfBirth: string, today: Date = platformToday()): string | null {
  const age = ageOn(dateOfBirth, today);
  if (age === null || age < 0 || age > MAX_REGISTRATION_AGE) return INVALID_DOB_MESSAGE;
  if (age < MIN_REGISTRATION_AGE) return UNDERAGE_MESSAGE;
  return null;
}

/** A birth date as registration accepts it: a real `YYYY-MM-DD`, 18 to 100 years ago. */
export const DateOfBirthSchema = z.string().superRefine((value, ctx) => {
  const message = dateOfBirthError(value);
  if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
});

/**
 * The terms version the app shows today. Registration accepts only this, so
 * an account can't claim to have agreed to terms nobody showed it. Bump it
 * together with the app when the terms change.
 */
export const CURRENT_TERMS_VERSION = 'v1.0';

/** Body for POST /auth/register — fields not in Firebase. */
export const RegisterRequestSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    // Email is also on the Firebase token, but we accept and validate it here
    // so the backend doesn't have to derive it from the JWT for the insert.
    email: EmailSchema,
    // Proof from POST /auth/email/verify that this address belongs to whoever
    // is registering — required unless Firebase itself already verified it. A
    // Google or Apple sign-up arrives without one: its Firebase ID token says
    // `email_verified: true` for exactly this address, and `registerUser`
    // checks that instead. Every other sign-up still brings the token, so no
    // account is ever created with an unproven address — which is what lets
    // receipts, payment records and account recovery rely on `users.email`.
    emailVerificationToken: z
      .string()
      .min(1, 'Please verify your email address before finishing sign-up.')
      .optional(),
    phone: PhoneE164Schema,
    dateOfBirth: DateOfBirthSchema,
    role: RoleSchema,
    termsAcceptedVersion: z.literal(CURRENT_TERMS_VERSION, {
      errorMap: () => ({ message: 'Please accept the latest terms to continue.' }),
    }),
    // Required for both roles: the address book's first row is built from it,
    // and a pin with no street line leaves a nanny unable to find the door.
    address: z
      .string({ required_error: 'Please enter your street address.' })
      .trim()
      .min(1, 'Please enter your street address.')
      .max(200),
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
    // The step-1 photo, uploaded at the end of the wizard — required for both
    // roles: a nanny's is on her public profile, a mother's is what the nanny
    // sees on a booking request.
    avatarUrl: z.string({ required_error: 'Please add a profile photo.' }).url(),
    bio: z.string().trim().max(600).optional(),
    yearsOfExperience: z.number().int().min(0).max(60).optional(),
    ageRanges: z.array(AgeRangeSchema).optional(),
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
      (!!v.bio && v.yearsOfExperience !== undefined && !!v.availabilityType),
    {
      message: 'Nannies must provide a bio, years of experience, and availability.',
      path: ['bio'],
    },
  )
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
  /**
   * The user's default address, flattened. Derived from the addresses table
   * (the source of truth) and kept on this response so screens that only show
   * "where you are" keep working; edit through /addresses, not PATCH /auth/me.
   */
  address: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  createdAt: z.string(), // ISO datetime
});
export type UserResponse = z.infer<typeof UserResponseSchema>;

/**
 * Response of POST /auth/email — the updated profile plus, sometimes, a fresh
 * Firebase custom token.
 *
 * Moving the account's Firebase email is a "major account change" that
 * revokes every existing session for that uid (Firebase bumps
 * `tokensValidAfterTime`), including the ID token the caller authenticated
 * this very request with. When that happened on this call, `customToken` is
 * present and the mobile client trades it for a fresh session via
 * `signInWithCustomToken` right after, so the gate never leaves her signed
 * out mid-flow. It is **absent** whenever the call did not touch Firebase
 * (the idempotent no-op path, outside its short recovery window) — the
 * client's existing session is still good, so it skips the re-sign-in and
 * proceeds as normal. A client built against an older backend that never
 * sent this field at all must be treated the same way: no token means
 * nothing to trade in.
 */
export const SetVerifiedEmailResponseSchema = UserResponseSchema.extend({
  customToken: z.string().optional(),
});
export type SetVerifiedEmailResponse = z.infer<typeof SetVerifiedEmailResponseSchema>;

/** Body for PATCH /auth/me — all fields optional (patch semantics). */
export const UpdateProfileRequestSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  // No phone: a number is proven by SMS, and PATCH can't prove anything.
  // Changing it becomes its own verified flow later.
  avatarUrl: z.string().url().nullable().optional(),
  // No address or coordinates here: location is an address-book entry now
  // (see address.ts) and is edited through /addresses, so the display line
  // and the pin proximity search uses can never drift apart.
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
