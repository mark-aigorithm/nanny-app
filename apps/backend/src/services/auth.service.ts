import type {
  User,
  Role as PrismaRole,
} from '@prisma/client';
import {
  Role,
  type RegisterRequest,
  type Role as ApiRole,
  type SubmitIdRequest,
  type UpdateProfileRequest,
  type UserResponse,
} from '@nanny-app/shared';

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
 * markers) and serializes Date fields to ISO strings. Identity-verification
 * state now lives directly on the user row, so no relation include is needed.
 * The ID image URLs are intentionally NOT exposed here — they are KYC-sensitive
 * and only returned by admin endpoints.
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
    idVerificationStatus: user.idVerificationStatus,
    idDocumentType: user.idDocumentType,
    idRejectionReason: user.idRejectionReason,
    address: user.address,
    latitude: user.latitude !== null ? Number(user.latitude) : null,
    longitude: user.longitude !== null ? Number(user.longitude) : null,
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
  const isNanny = body.role === Role.NANNY;
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
        address: body.address ?? null,
        latitude: body.latitude,
        longitude: body.longitude,
        // Identity verification lives on the user row for both roles. Nannies
        // upload their ID at registration, so they start PENDING_REVIEW (awaiting
        // admin KYC); mothers upload later (before booking), so they start
        // PENDING_ID and are prompted when they try to book.
        idVerificationStatus: isNanny ? 'PENDING_REVIEW' : 'PENDING_ID',
        idDocumentType: isNanny ? (body.idDocumentType ?? null) : null,
        idDocumentFrontUrl: isNanny ? (body.idDocumentFrontUrl ?? null) : null,
        idDocumentBackUrl: isNanny ? (body.idDocumentBackUrl ?? null) : null,
      },
    });

    if (isNanny) {
      // Home location (address + coordinates) lives solely on the user row now;
      // proximity search and the booking broadcast read it from there, so
      // nothing is mirrored onto the profile.
      await tx.nannyProfile.create({
        data: { userId: user.id },
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

/**
 * Updates the authenticated user's profile fields. Email is managed by
 * Firebase and is not patchable here.
 */
export async function updateProfile(
  decoded: DecodedIdToken,
  body: UpdateProfileRequest,
): Promise<UserResponse> {
  const user = await prisma.user.findUnique({
    where: { firebaseUid: decoded.uid },
  });
  if (!user || user.deletedAt) {
    throw errors.notFound('User profile not found. Please complete registration.');
  }

  if (body.phone) {
    const phoneOwner = await prisma.user.findFirst({
      where: {
        phone: body.phone,
        id: { not: user.id },
        deletedAt: null,
      },
    });
    if (phoneOwner) {
      throw errors.conflict('An account with this phone number already exists.');
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(body.firstName !== undefined && { firstName: body.firstName }),
      ...(body.lastName !== undefined && { lastName: body.lastName }),
      ...(body.phone !== undefined && { phone: body.phone }),
      ...(body.avatarUrl !== undefined && { avatarUrl: body.avatarUrl }),
      // Home location — the single source of truth for proximity search.
      ...(body.address !== undefined && { address: body.address }),
      ...(body.latitude !== undefined && { latitude: body.latitude }),
      ...(body.longitude !== undefined && { longitude: body.longitude }),
    },
  });

  return toUserResponse(updated);
}

/**
 * A user (re)submits their identity document outside of registration: a nanny
 * re-uploading after an admin reject, or a mother uploading before her first
 * booking. Stores the document + type and moves the account to PENDING_REVIEW
 * for admin KYC, clearing any prior rejection reason.
 */
export async function submitId(
  decoded: DecodedIdToken,
  body: SubmitIdRequest,
): Promise<UserResponse> {
  const user = await prisma.user.findUnique({
    where: { firebaseUid: decoded.uid },
  });
  if (!user || user.deletedAt) {
    throw errors.notFound('User profile not found. Please complete registration.');
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      idDocumentType: body.idDocumentType,
      idDocumentFrontUrl: body.idDocumentFrontUrl,
      // A passport has no back image — clear any stale value from a prior upload.
      idDocumentBackUrl: body.idDocumentBackUrl ?? null,
      idVerificationStatus: 'PENDING_REVIEW',
      idRejectionReason: null,
      idReviewedAt: null,
    },
  });

  return toUserResponse(updated);
}
