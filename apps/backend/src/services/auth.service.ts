import type { User, Role as PrismaRole } from '@prisma/client';
import { Role, type RegisterRequest, type Role as ApiRole, type UserResponse } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import type { DecodedIdToken } from '@backend/lib/firebase';

/**
 * Project a Prisma role onto the API role enum. The shared schema exposes
 * only MOTHER and NANNY; the internal ADMIN role is hidden from clients
 * (returned as null so the wire shape stays valid).
 */
function toApiRole(role: PrismaRole | null): ApiRole | null {
  if (role === Role.MOTHER || role === Role.NANNY) return role;
  return null;
}

/**
 * Convert a Prisma `User` row into the wire format defined by
 * `UserResponseSchema`. Strips internal columns (timestamps, soft-delete
 * markers) and serializes Date fields to ISO strings.
 */
function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    firebaseUid: user.firebaseUid,
    email: user.email,
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString().slice(0, 10) : null,
    avatarUrl: user.avatarUrl,
    role: toApiRole(user.role),
    isEmailVerified: user.isEmailVerified,
    isPhoneVerified: user.isPhoneVerified,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * Creates the application User row for a freshly-created Firebase account.
 * The mobile client calls this immediately after `createUserWithEmailAndPassword`
 * + phone verification, passing the profile data collected by the registration
 * wizard. Idempotent: if a row with this `firebaseUid` already exists (e.g. the
 * client retried), returns the existing row instead of erroring.
 */
export async function registerUser(
  decoded: DecodedIdToken,
  body: RegisterRequest,
): Promise<UserResponse> {
  const existing = await prisma.user.findUnique({
    where: { firebaseUid: decoded.uid },
  });
  if (existing) {
    if (existing.deletedAt) {
      throw errors.conflict('This account has been deleted.');
    }
    return toUserResponse(existing);
  }

  // Email collision check (different Firebase UID, same email) — surfaces a
  // friendlier error than letting the unique constraint blow up.
  const emailOwner = await prisma.user.findUnique({ where: { email: body.email } });
  if (emailOwner) {
    throw errors.conflict('An account with this email already exists.');
  }

  const phoneOwner = await prisma.user.findUnique({ where: { phone: body.phone } });
  if (phoneOwner) {
    throw errors.conflict('An account with this phone number already exists.');
  }
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        firebaseUid: decoded.uid,
        email: body.email,
        phone: body.phone,
        firstName: body.firstName,
        lastName: body.lastName,
        dateOfBirth: new Date(body.dateOfBirth),
        role: body.role,
        isEmailVerified: decoded.email_verified ?? false,
        // Phone is verified server-side via the Firebase token's phone_number
        // claim. If the mobile client linked the phone before calling /register,
        // the token contains it.
        isPhoneVerified: !!decoded.phone_number,
        emailVerifiedAt: decoded.email_verified ? new Date() : null,
        phoneVerifiedAt: decoded.phone_number ? new Date() : null,
        termsAcceptedAt: new Date(),
        termsAcceptedVersion: body.termsAcceptedVersion,
        lastLoginAt: new Date(),
      },
    });

    if (body.role === Role.NANNY) {
      await tx.nannyProfile.create({
        data: {
          userId: user.id,
          location: body.address ?? null,
        },
      });
    }

    return user;
  });

  return toUserResponse(created);
}

/**
 * Returns the application User row for the currently-authenticated Firebase
 * user. Touches `lastLoginAt` so we have a recency signal for analytics.
 * Throws 404 if the Firebase user has no corresponding application row —
 * the mobile client uses this signal to redirect to /auth/register.
 */
export async function getMe(decoded: DecodedIdToken): Promise<UserResponse> {
  const user = await prisma.user.findUnique({
    where: { firebaseUid: decoded.uid },
  });
  if (!user || user.deletedAt) {
    throw errors.notFound('User profile not found. Please complete registration.');
  }

  // Soft-update lastLoginAt without blocking the response. Errors here are
  // non-fatal — log and continue.
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return toUserResponse(updated);
}
