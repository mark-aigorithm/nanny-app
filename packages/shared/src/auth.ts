import { z } from 'zod';

import { NannyApprovalStatusSchema } from './nanny';

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

/** Body for POST /auth/register — fields not in Firebase. */
export const RegisterRequestSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  // Email is also on the Firebase token, but we accept and validate it here
  // so the backend doesn't have to derive it from the JWT for the insert.
  email: z.string().trim().toLowerCase().email(),
  phone: z
    .string()
    .trim()
    .regex(/^\+\d{7,15}$/, 'phone must be E.164, e.g. +15551234567'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must be YYYY-MM-DD'),
  role: RoleSchema,
  termsAcceptedVersion: z.string().min(1),
  address: z.string().trim().max(200).optional(),
  // Home coordinates from the registration map picker — required so
  // proximity search / distance sorting work for every account.
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

/** Shape returned by /auth/me and /auth/register. Mirrors Prisma `User` minus internal fields. */
export const UserResponseSchema = z.object({
  id: z.string(),
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
  /** Vetting state of the nanny profile; null for non-nanny users. */
  nannyApprovalStatus: NannyApprovalStatusSchema.nullable(),
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
