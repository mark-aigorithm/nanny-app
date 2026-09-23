import type {
  User,
  Role as PrismaRole,
} from '@prisma/client';
import {
  Role,
  type AvailabilityResponse,
  type CheckAvailabilityRequest,
  type Child as ChildDto,
  type RegisterRequest,
  type Role as ApiRole,
  type SaveChildrenRequest,
  type SetVerifiedEmailRequest,
  type SetVerifiedEmailResponse,
  type SubmitIdRequest,
  type UpdateProfileRequest,
  type UserResponse,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { firebaseAuth, type DecodedIdToken } from '@backend/lib/firebase';
import { reconcileNannySkills } from '@backend/services/admin-nanny.service';
import { reconcileNannyCertifications } from '@backend/services/certification.service';
import { consumeVerificationToken } from '@backend/services/email-verification.service';
import { createAddress, getDefaultAddress } from './address.service';
import { listChildren, saveChildren } from './child.service';

/**
 * Project a Prisma role onto the API role enum. The shared schema exposes
 * only MOTHER and NANNY; the internal ADMIN role is hidden from clients
 * (returned as null so the wire shape stays valid).
 */
function toApiRole(role: PrismaRole | null): ApiRole | null {
  if (role === Role.MOTHER || role === Role.NANNY) return role;
  return null;
}

/** The location fields of UserResponse, flattened off the default address. */
type FlatLocation = Pick<UserResponse, 'address' | 'latitude' | 'longitude'>;

/**
 * The user's default address as the three flat fields the profile response
 * has always carried, so screens that only show "where you are" keep working
 * while the address book is the source of truth. Null when there is none.
 */
async function flatLocationOf(userId: number): Promise<FlatLocation> {
  const home = await getDefaultAddress(userId);
  return home
    ? {
        address: home.formattedAddress,
        latitude: Number(home.latitude),
        longitude: Number(home.longitude),
      }
    : { address: null, latitude: null, longitude: null };
}

/**
 * Convert a Prisma `User` row into the wire format defined by
 * `UserResponseSchema`. Strips internal columns (timestamps, soft-delete
 * markers) and serializes Date fields to ISO strings. The ID image URLs are
 * intentionally NOT exposed here — they are KYC-sensitive and only returned
 * by admin endpoints. Location comes from the address book (see
 * flatLocationOf), never from the deprecated user columns.
 */
function toUserResponse(user: User, location: FlatLocation): UserResponse {
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
    approvalStatus: user.approvalStatus,
    idDocumentType: user.idDocumentType,
    rejectionReason: user.rejectionReason,
    ...location,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * Whether an email or phone already belongs to a user row. This is the one
 * rule for "taken", asked twice: from step 1 of the wizard via
 * `checkAvailability`, and again by `registerUser` before the insert — so the
 * early answer and the final one cannot drift apart.
 *
 * Deliberately no `deletedAt` filter: `users.email` and `users.phone` are
 * unique columns, so a soft-deleted row still holding the value would make the
 * insert fail, and this must report what the insert will do. (Rows freed for
 * re-registration have those columns mangled — see test/e2e/seed-mobile.ts.)
 */
async function findIdentityOwners(email: string, phone: string): Promise<AvailabilityResponse> {
  const [emailOwner, phoneOwner] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.user.findUnique({ where: { phone } }),
  ]);
  return { emailTaken: emailOwner !== null, phoneTaken: phoneOwner !== null };
}

/**
 * Step 1 of the wizard asks this before moving on, so a taken email or phone
 * is refused while the fields are still on screen. Public and side-effect
 * free; the body has already been normalised by CheckAvailabilitySchema.
 */
export async function checkAvailability(
  body: CheckAvailabilityRequest,
): Promise<AvailabilityResponse> {
  return findIdentityOwners(body.email, body.phone);
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
    return toUserResponse(existing, await flatLocationOf(existing.id));
  }

  // Collision check (different Firebase UID, same email or phone) — the same
  // lookup step 1 of the wizard ran, so this only fires if the value was taken
  // in between. Surfaces a friendlier error than letting the unique constraint
  // blow up.
  const { emailTaken, phoneTaken } = await findIdentityOwners(body.email, body.phone);
  if (emailTaken) {
    throw errors.conflict('An account with this email already exists.');
  }
  if (phoneTaken) {
    throw errors.conflict('An account with this phone number already exists.');
  }
  const isNanny = body.role === Role.NANNY;
  // Both roles prove their address mid-wizard and arrive holding the token for
  // it (the shared schema makes it mandatory), so no account is created with an
  // unproven address.
  const emailVerificationToken = body.emailVerificationToken;
  const created = await prisma.$transaction(async (tx) => {
    // Inside the transaction so the token isn't burned by a registration that
    // then fails — either the user exists with a verified address, or the token
    // is still spendable on a retry.
    await consumeVerificationToken(body.email, emailVerificationToken, tx);

    const user = await tx.user.create({
      data: {
        firebaseUid: decoded.uid,
        email: body.email,
        phone: body.phone,
        firstName: body.firstName,
        lastName: body.lastName,
        dateOfBirth: new Date(body.dateOfBirth),
        role: body.role,
        // The token above was just spent for this address, so it is proven.
        isEmailVerified: true,
        // Phone is verified server-side via the Firebase token's phone_number
        // claim. If the mobile client linked the phone before calling /register,
        // the token contains it.
        isPhoneVerified: !!decoded.phone_number,
        emailVerifiedAt: new Date(),
        phoneVerifiedAt: decoded.phone_number ? new Date() : null,
        termsAcceptedAt: new Date(),
        termsAcceptedVersion: body.termsAcceptedVersion,
        lastLoginAt: new Date(),
        // Approval state lives on the user row for both roles. A nanny uploads
        // her ID at registration and starts PENDING_REVIEW, awaiting an admin's
        // decision on her whole application; a mother uploads later, before
        // booking, so she starts PENDING_ID and is prompted when she tries to
        // book.
        approvalStatus: isNanny ? 'PENDING_REVIEW' : 'PENDING_ID',
        idDocumentType: isNanny ? (body.idDocumentType ?? null) : null,
        idDocumentFrontUrl: isNanny ? (body.idDocumentFrontUrl ?? null) : null,
        idDocumentBackUrl: isNanny ? (body.idDocumentBackUrl ?? null) : null,
        avatarUrl: isNanny ? (body.avatarUrl ?? null) : null,
      },
    });

    // The wizard's location becomes the user's first address — her default,
    // and for a nanny the only one she will ever have (support edits it from
    // here on). Same transaction as the user row, so neither exists alone.
    // The wizard captures one line and a pin; the structured parts stay null
    // until the address is edited in-app.
    const home = await createAddress(
      user.id,
      {
        label: 'Home',
        formattedAddress: body.address ?? '',
        latitude: body.latitude,
        longitude: body.longitude,
        isDefault: true,
      },
      tx,
    );

    if (isNanny) {
      const profile = await tx.nannyProfile.create({
        data: {
          userId: user.id,
          bio: body.bio ?? null,
          yearsOfExperience: body.yearsOfExperience ?? null,
          ageRanges: body.ageRanges ?? [],
          schedule: body.schedule,
          availabilityType: body.availabilityType,
        },
      });

      // Reconcile the catalog links the nanny selected during sign-up, inside
      // the same transaction as the profile create so the whole registration
      // is atomic.
      await reconcileNannyCertifications(tx, profile.id, body.certificationIds ?? []);
      await reconcileNannySkills(tx, profile.id, body.skillIds ?? []);
    }

    return { user, home };
  });

  // Our own OTP proved the address inside the transaction above; keep
  // Firebase's copy of that fact in step, so reset mail is never held back.
  await firebaseAuth.updateUser(decoded.uid, { emailVerified: true });

  return toUserResponse(created.user, {
    address: created.home.formattedAddress,
    latitude: created.home.latitude,
    longitude: created.home.longitude,
  });
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

  return toUserResponse(updated, await flatLocationOf(updated.id));
}

/** The current user's row, or a 404 telling the client to finish registration. */
async function requireUser(decoded: DecodedIdToken): Promise<User> {
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user || user.deletedAt) {
    throw errors.notFound('User profile not found. Please complete registration.');
  }
  return user;
}

/** The mother's saved children, used to prefill the booking sheet. */
export async function getMyChildren(decoded: DecodedIdToken): Promise<ChildDto[]> {
  const user = await requireUser(decoded);
  return listChildren(user.id);
}

/**
 * Replaces the mother's saved children. Mothers only — a nanny has no family on
 * file here, and letting her write one would just be dead data.
 */
export async function saveMyChildren(
  decoded: DecodedIdToken,
  body: SaveChildrenRequest,
): Promise<ChildDto[]> {
  const user = await requireUser(decoded);
  if (user.role !== Role.MOTHER) {
    throw errors.forbidden('Only mothers can save children.');
  }
  return saveChildren(user.id, body.children);
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
      // No location here — it is an address-book entry now, edited through
      // /addresses so the display line and the pin can never drift apart.
    },
  });

  return toUserResponse(updated, await flatLocationOf(updated.id));
}

/**
 * Moves the account's Firebase address to the one she just proved.
 *
 * Firebase keys the password credential by email, so this is what makes
 * `sendPasswordResetEmail` reach a real inbox — and it is the migration path
 * for accounts created while the credential was a phone-derived placeholder.
 * Called *before* the token is spent: a refusal here must leave the token
 * spendable so a retry can succeed.
 */
async function moveFirebaseEmail(uid: string, email: string): Promise<void> {
  try {
    await firebaseAuth.updateUser(uid, { email, emailVerified: true });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'auth/email-already-exists') {
      throw errors.conflict('An account with this email already exists.');
    }
    throw err;
  }
}

/**
 * Attaches a proven email address to the signed-in user, spending the token
 * issued by `POST /auth/email/verify`. Registration now proves the address for
 * both roles, so this serves accounts created before that: they carry a
 * phone-derived placeholder, and the app blocks them on a verify screen at
 * launch until they call this.
 *
 * Idempotent on the address: if she already holds it and it is already
 * verified, the row is returned unchanged rather than failing on a token that
 * a retried request already consumed. That matters because the client updates
 * Firebase before calling this, so a network blip here is retried.
 *
 * Returns a fresh Firebase custom token alongside the profile. Moving the
 * account's Firebase email is a "major account change" that revokes every
 * existing session for that uid (Firebase bumps `tokensValidAfterTime`) — the
 * very ID token this request was authenticated with dies the instant the
 * swap happens. Without a way back in, the caller would be silently signed
 * out mid-flow, so the mobile client exchanges this token for a new session
 * via `signInWithCustomToken` right after. Minted on every path (including
 * the no-op above) so the response shape — and the client's re-sign-in call —
 * never has to branch on which path was taken.
 */
export async function setVerifiedEmail(
  decoded: DecodedIdToken,
  body: SetVerifiedEmailRequest,
): Promise<SetVerifiedEmailResponse> {
  const user = await requireUser(decoded);

  if (user.email === body.email && user.isEmailVerified) {
    const customToken = await firebaseAuth.createCustomToken(user.firebaseUid);
    return { ...toUserResponse(user, await flatLocationOf(user.id)), customToken };
  }

  const emailOwner = await prisma.user.findFirst({
    where: { email: body.email, id: { not: user.id }, deletedAt: null },
    select: { id: true },
  });
  if (emailOwner) {
    throw errors.conflict('An account with this email already exists.');
  }

  // Firebase first: a failure here must not burn the token.
  await moveFirebaseEmail(user.firebaseUid, body.email);

  await consumeVerificationToken(body.email, body.verificationToken);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      email: body.email,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  // See the doc comment above: the swap above just revoked the caller's own
  // session, so mint the replacement before returning.
  const customToken = await firebaseAuth.createCustomToken(user.firebaseUid);

  return { ...toUserResponse(updated, await flatLocationOf(updated.id)), customToken };
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
      approvalStatus: 'PENDING_REVIEW',
      rejectionReason: null,
      reviewedAt: null,
    },
  });

  return toUserResponse(updated, await flatLocationOf(updated.id));
}
