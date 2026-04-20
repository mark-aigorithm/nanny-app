import { z } from 'zod';

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
  createdAt: z.string(), // ISO datetime
});
export type UserResponse = z.infer<typeof UserResponseSchema>;

/** Standard API envelope used by every backend response (success and error). */
export const ApiSuccessSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ data, error: z.null() });

export const ApiErrorSchema = z.object({
  data: z.null(),
  error: z.string(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export type ApiResponse<T> = { data: T; error: null } | { data: null; error: string };
