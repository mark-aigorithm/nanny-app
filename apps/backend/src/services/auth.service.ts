import type {
  User,
  Role as PrismaRole,
} from '@prisma/client';
import {
  Role,
  type Address as AddressDto,
  type AvailabilityResponse,
  type CheckAvailabilityRequest,
  type PhoneAccountCheckResponse,
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
import { firebaseErrorCode, isUserNotFound } from '@backend/lib/firebase-errors';
import { uniqueClashFields } from '@backend/lib/prisma-errors';
import { assertOwnStorageUrl } from '@backend/lib/storage-url';
import { reconcileNannySkills } from '@backend/services/admin-nanny.service';
import { reconcileNannyCertifications } from '@backend/services/certification.service';
import {
  assertVerificationTokenIsValid,
  consumeVerificationToken,
} from '@backend/services/email-verification.service';
import { createAddress, getDefaultAddress } from './address.service';
import { listChildren, saveChildren } from './child.service';

// The copy the app shows for each refusal — one string per outcome, so the
// several paths that reach the same outcome can't word it differently.
const PROFILE_NOT_FOUND = 'User profile not found. Please complete registration.';
const ACCOUNT_DELETED = 'This account has been deleted.';
const EMAIL_TAKEN = 'An account with this email already exists.';
const PHONE_TAKEN = 'An account with this phone number already exists.';

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
 * rule for "taken", asked from the wizard via `checkAvailability` (phone alone
 * on "Your number", both on "About you"), and again by `registerUser` before
 * the insert — so the early answer and the final one cannot drift apart. With
 * no email, the email half is skipped and reported free.
 *
 * Deliberately no `deletedAt` filter: `users.email` and `users.phone` are
 * unique columns, so a soft-deleted row still holding the value would make the
 * insert fail, and this must report what the insert will do. (A self-deleted
 * account frees them — see `scrambleIdentity` in account-deletion.service.ts.)
 */
async function findIdentityOwners(
  email: string | undefined,
  phone: string,
): Promise<AvailabilityResponse> {
  const [emailOwner, phoneOwner] = await Promise.all([
    email === undefined ? null : prisma.user.findUnique({ where: { email } }),
    prisma.user.findUnique({ where: { phone } }),
  ]);
  return { emailTaken: emailOwner !== null, phoneTaken: phoneOwner !== null };
}

/**
 * The wizard asks this before moving on, so a taken email or phone is refused
 * while the field is still on screen — and a taken phone before any SMS is
 * paid for. Public and side-effect
 * free; the body has already been normalised by CheckAvailabilitySchema.
 */
export async function checkAvailability(
  body: CheckAvailabilityRequest,
): Promise<AvailabilityResponse> {
  return findIdentityOwners(body.email, body.phone);
}

/**
 * Whether an SMS sign-in (or SMS reset) with this number can lead anywhere,
 * asked before the SMS is paid for. True when:
 * - a `users` row holds the phone — the same lookup as `findIdentityOwners`,
 *   so a deleted account (its phone scrambled to null) doesn't count, and an
 *   orphaned row (its Firebase user gone) does: `reattachOrphanedRow` moves it
 *   onto the new uid once she signs in; or
 * - a Firebase user holds it with any provider besides `phone` — a sign-up
 *   that stopped before `/auth/register`, which the app resumes.
 * A phone-only Firebase user with no row is the stray the SMS door itself
 * mints and discards, so it doesn't count. Any Firebase failure other than
 * user-not-found is rethrown: an unknown answer is never "no account".
 */
export async function phoneHasAccount(phone: string): Promise<PhoneAccountCheckResponse> {
  if (await prisma.user.findUnique({ where: { phone }, select: { id: true } })) {
    return { hasAccount: true };
  }
  try {
    const holder = await firebaseAuth.getUserByPhoneNumber(phone);
    return { hasAccount: holder.providerData.some((p) => p.providerId !== 'phone') };
  } catch (err) {
    if (isUserNotFound(err)) return { hasAccount: false };
    throw err;
  }
}

/**
 * What a Google or Apple sign-up brings instead of our email OTP token: the
 * Firebase ID token itself says this exact address is verified. Only Firebase
 * sets `email_verified` — after Google or Apple vouched for the address, or
 * after one of its own verification flows — so a client cannot claim it. A
 * phone sign-up's linked email/password credential is still unverified at
 * this point, so that path keeps presenting a token.
 */
function assertFirebaseVerifiedEmail(decoded: DecodedIdToken, email: string): void {
  const tokenEmail = decoded.email?.trim().toLowerCase();
  if (decoded.email_verified !== true || !tokenEmail || tokenEmail !== email.trim().toLowerCase()) {
    throw errors.badRequest('Please verify your email address before finishing sign-up.');
  }
}

/**
 * The address our OTP proved must be the one this Firebase account signs in
 * with. The phone wizard links an email/password credential for exactly that
 * address before registering; if they differ (a retried wizard that linked
 * another address, a client bug), the row would hold one email and Firebase
 * another, and email sign-in and password reset would reach the wrong inbox.
 */
function assertTokenEmailMatchesAccount(decoded: DecodedIdToken, email: string): void {
  const accountEmail = decoded.email?.trim().toLowerCase();
  if (!accountEmail || accountEmail !== email.trim().toLowerCase()) {
    throw errors.badRequest("The email you verified doesn't match this account. Please start again.");
  }
}

/**
 * Best-effort: keep Firebase's `emailVerified` in step with the row, whose
 * address we proved. The row is already committed when this runs, so a
 * Firebase hiccup must not turn a real registration into a 500;
 * `migrate-firebase-emails.ts` catches anything left out of step.
 */
async function markFirebaseEmailVerified(uid: string): Promise<void> {
  try {
    await firebaseAuth.updateUser(uid, { emailVerified: true });
  } catch (err) {
    console.warn('[auth] failed to mark the Firebase account email-verified', { uid, err });
  }
}

/**
 * A registration that failed inside its transaction may have lost a race
 * rather than failed: a double tap, or a retry that overlapped the first
 * request. If a row for this uid exists now, the other request made it —
 * answer with it, as the idempotent path would have (or, if that row was
 * soft-deleted between requests, the same conflict the idempotent path
 * throws). Otherwise a unique clash means someone else took the email or
 * phone since the lookup above.
 *
 * The lookup itself can fail (a dropped connection, say) — that must not
 * swallow the original transaction error, which is the one worth surfacing.
 */
async function resolveFailedRegistration(
  decoded: DecodedIdToken,
  err: unknown,
): Promise<UserResponse> {
  let winner: User | null;
  try {
    winner = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  } catch (lookupErr) {
    console.warn('[auth] could not check for a concurrent registration', {
      uid: decoded.uid,
      err: lookupErr,
    });
    throw err;
  }

  if (winner) {
    if (winner.deletedAt) {
      throw errors.conflict(ACCOUNT_DELETED);
    }
    return toUserResponse(winner, await flatLocationOf(winner.id));
  }

  const fields = uniqueClashFields(err);
  if (fields) {
    const joined = fields.join(' ');
    if (joined.includes('phone')) {
      throw errors.conflict(PHONE_TAKEN);
    }
    if (joined.includes('email')) {
      throw errors.conflict(EMAIL_TAKEN);
    }
    throw errors.conflict('An account with these details already exists.');
  }
  throw err;
}

/**
 * The phone on a new account must be the one this Firebase account verified.
 * `phone_number` only appears on the ID token after Firebase checked an SMS
 * code for it — both wizards link the phone before calling /auth/register —
 * so a caller cannot claim a number it never proved. Without this, any
 * Firebase account (a Google-only one, say) could create a row holding
 * someone else's not-yet-registered number, and `users.phone` is unique.
 */
function assertFirebaseVerifiedPhone(decoded: DecodedIdToken, phone: string): void {
  if (!decoded.phone_number || decoded.phone_number !== phone) {
    throw errors.badRequest('Please verify your phone number before finishing sign-up.');
  }
}

/**
 * Creates the application User row for a freshly-created Firebase account.
 * The mobile client calls this at the end of the registration wizard, once the
 * verified phone is linked onto the Firebase account, passing the profile data
 * the wizard collected. Idempotent: if a row with this `firebaseUid` already
 * exists (e.g. the client retried), returns the existing row instead of erroring.
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
      throw errors.conflict(ACCOUNT_DELETED);
    }
    // A retry after a lost response, or after the best-effort update at the
    // end failed: the row says proven, so Firebase should too. Also require
    // the token's own email to match the row — a legacy account whose
    // Firebase address is still a phone-derived placeholder (see
    // moveFirebaseEmail) must never be marked verified on that placeholder.
    const decodedEmail = decoded.email?.trim().toLowerCase();
    if (
      existing.isEmailVerified &&
      decoded.email_verified !== true &&
      decodedEmail === existing.email.trim().toLowerCase()
    ) {
      await markFirebaseEmailVerified(decoded.uid);
    }
    return toUserResponse(existing, await flatLocationOf(existing.id));
  }

  // Before the collision lookup, so an unverified number learns nothing about
  // who holds it.
  assertFirebaseVerifiedPhone(decoded, body.phone);

  // Before anything is written: the photos must be this account's own uploads.
  assertOwnStorageUrl(body.avatarUrl, decoded.uid, 'avatars');
  if (body.idDocumentFrontUrl) assertOwnStorageUrl(body.idDocumentFrontUrl, decoded.uid, 'nanny-ids');
  if (body.idDocumentBackUrl) assertOwnStorageUrl(body.idDocumentBackUrl, decoded.uid, 'nanny-ids');

  // Phone sign-ups prove their address mid-wizard and arrive holding the token
  // for it — which must be for the address this account signs in with. Google
  // and Apple sign-ups arrive without one, because Firebase has already
  // verified the provider's address — so check that instead. Either way, no
  // account is created with an unproven address.
  const emailVerificationToken = body.emailVerificationToken;
  if (emailVerificationToken) {
    assertTokenEmailMatchesAccount(decoded, body.email);
  } else {
    assertFirebaseVerifiedEmail(decoded, body.email);
  }

  // Collision check (different Firebase UID, same email or phone) — the same
  // lookup step 1 of the wizard ran, so this only fires if the value was taken
  // in between. Surfaces a friendlier error than letting the unique constraint
  // blow up.
  const { emailTaken, phoneTaken } = await findIdentityOwners(body.email, body.phone);
  if (emailTaken) {
    throw errors.conflict(EMAIL_TAKEN);
  }
  if (phoneTaken) {
    throw errors.conflict(PHONE_TAKEN);
  }
  const isNanny = body.role === Role.NANNY;
  let created: { user: User; home: AddressDto };
  try {
    created = await prisma.$transaction(async (tx) => {
      // Inside the transaction so the token isn't burned by a registration that
      // then fails — either the user exists with a verified address, or the token
      // is still spendable on a retry.
      if (emailVerificationToken) {
        await consumeVerificationToken(body.email, emailVerificationToken, tx);
      }

      const user = await tx.user.create({
        data: {
          firebaseUid: decoded.uid,
          email: body.email,
          phone: body.phone,
          firstName: body.firstName,
          lastName: body.lastName,
          dateOfBirth: new Date(body.dateOfBirth),
          role: body.role,
          // Proven either way: the token above was spent for this address, or
          // Firebase's own token vouched for it.
          isEmailVerified: true,
          // Proven: assertFirebaseVerifiedPhone matched it to the token's
          // phone_number claim above.
          isPhoneVerified: true,
          emailVerifiedAt: new Date(),
          phoneVerifiedAt: new Date(),
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
          // Both roles bring a photo from step 1 — the mother's is what a nanny
          // sees on her booking request.
          avatarUrl: body.avatarUrl,
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
          formattedAddress: body.address,
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
  } catch (err) {
    return resolveFailedRegistration(decoded, err);
  }

  // The row now says the address is proven (by our OTP, or by Firebase's own
  // claim for a Google/Apple sign-up); keep Firebase's copy of that in step.
  // For the latter this is a no-op write.
  await markFirebaseEmailVerified(decoded.uid);

  return toUserResponse(created.user, {
    address: created.home.formattedAddress,
    latitude: created.home.latitude,
    longitude: created.home.longitude,
  });
}

/**
 * A row whose Firebase user was deleted would lock its owner out forever: every
 * new sign-in mints a fresh uid that no row points at. When the new token
 * proves the row's phone (or, verified, its email) and the old uid is truly
 * gone, move the row onto the new uid. Guarded on the old uid so two racing
 * requests re-point it once. Any Firebase error other than user-not-found
 * aborts (rethrown) — never re-point on an uncertain answer.
 */
async function reattachOrphanedRow(decoded: DecodedIdToken): Promise<User | null> {
  const phone = decoded.phone_number ?? null;
  const email = decoded.email_verified === true && decoded.email ? decoded.email.toLowerCase() : null;
  if (!phone && !email) return null;

  const candidates = await prisma.user.findMany({
    where: {
      deletedAt: null,
      role: { in: [Role.MOTHER, Role.NANNY] },
      OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])],
    },
  });
  const [row] = candidates;
  if (!row || candidates.length !== 1) return null;
  if (row.firebaseUid === decoded.uid) return row;

  try {
    await firebaseAuth.getUser(row.firebaseUid);
    return null; // the old account still exists — not an orphan
  } catch (err) {
    if (!isUserNotFound(err)) throw err;
  }

  const moved = await prisma.user.updateMany({
    where: { id: row.id, firebaseUid: row.firebaseUid, deletedAt: null },
    data: { firebaseUid: decoded.uid },
  });
  console.warn('[auth] re-attached an orphaned row', {
    userId: row.id,
    fromUid: row.firebaseUid,
    toUid: decoded.uid,
    moved: moved.count,
  });
  return prisma.user.findFirst({ where: { firebaseUid: decoded.uid, deletedAt: null } });
}

/**
 * The current user's row, or a 404 telling the client to finish registration.
 * A row orphaned by a deleted Firebase user is re-attached on the way (see
 * `reattachOrphanedRow`).
 */
async function requireUser(decoded: DecodedIdToken): Promise<User> {
  let user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  // Only a uid with no row at all is re-attached: firebaseUid is unique, so a
  // soft-deleted row still holds the uid (and a deleted account stays deleted).
  if (!user) user = await reattachOrphanedRow(decoded);
  if (!user || user.deletedAt) {
    throw errors.notFound(PROFILE_NOT_FOUND);
  }
  return user;
}

/**
 * Returns the application User row for the currently-authenticated Firebase
 * user. Touches `lastLoginAt` so we have a recency signal for analytics.
 * Throws 404 if the Firebase user has no corresponding application row —
 * the mobile client uses this signal to resume the registration wizard.
 */
export async function getMe(decoded: DecodedIdToken): Promise<UserResponse> {
  const user = await requireUser(decoded);

  // Awaited, so a failure here fails the request like any other DB error.
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return toUserResponse(updated, await flatLocationOf(updated.id));
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
  const user = await requireUser(decoded);

  if (body.avatarUrl) assertOwnStorageUrl(body.avatarUrl, decoded.uid, 'avatars');

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(body.firstName !== undefined && { firstName: body.firstName }),
      ...(body.lastName !== undefined && { lastName: body.lastName }),
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
    if (firebaseErrorCode(err) === 'auth/email-already-exists') {
      throw errors.conflict(EMAIL_TAKEN);
    }
    throw err;
  }
}

/**
 * How recently `emailVerifiedAt` must have happened for the idempotent no-op
 * branch below to also mint a session-recovery token. Covers a real swap
 * whose response (customToken included) never reached the client — e.g. a
 * network drop right after the swap — so a retry lands here instead of on a
 * fresh `verificationToken` it no longer has, and still needs a way back in.
 *
 * Bounded on purpose: `requireAuth` does not check revocation (see the design
 * doc's Session revocation note), so a revoked-but-not-yet-expired ID token
 * could otherwise keep converting itself into fresh sessions indefinitely
 * just by calling this endpoint with the account's own already-verified
 * address. Outside the window, the no-op returns without a token — the
 * caller's existing session is presumably still fine, since nothing here
 * revoked it.
 *
 * The window alone is not proof of anything: `verificationToken` is only
 * `min(1)` in the shared schema, so *inside* the window this branch also
 * requires that token to be a currently-spendable one (see the
 * `assertVerificationTokenIsValid` / `consumeVerificationToken` calls below)
 * — otherwise any valid (even revoked) ID token, the account's own
 * already-verified address, and any non-empty string would mint a fresh,
 * indefinite session. A genuine retry after a lost response always arrives
 * with a fresh, unspent token, because `verifyEmailOtp` only matches
 * unverified rows — so the real recovery case still goes through.
 */
const SESSION_RECOVERY_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Attaches a proven email address to the signed-in user, spending the token
 * issued by `POST /auth/email/verify`. Registration now proves the address for
 * both roles, so this serves accounts created before that: they carry a
 * phone-derived placeholder, and the app blocks them on a verify screen at
 * launch until they call this.
 *
 * Idempotent on the address: if she already holds it and it is already
 * verified, the row is returned unchanged rather than failing on a token that
 * a retried request already consumed — a request whose response was lost has
 * already moved the Firebase email and spent the token, so its retry lands
 * here.
 *
 * The response's `customToken` is present exactly when this call may have
 * revoked the caller's own session: moving the account's Firebase email is a
 * "major account change" that revokes every existing session for that uid
 * (Firebase bumps `tokensValidAfterTime`) — the very ID token this request
 * was authenticated with dies the instant the swap happens. Without a way
 * back in, the caller would be silently signed out mid-flow, so the mobile
 * client exchanges this token for a new session via `signInWithCustomToken`
 * right after. Absent when nothing was revoked (the no-op branch, outside its
 * recovery window), so the client knows to keep its current session instead.
 */
export async function setVerifiedEmail(
  decoded: DecodedIdToken,
  body: SetVerifiedEmailRequest,
): Promise<SetVerifiedEmailResponse> {
  const user = await requireUser(decoded);

  if (user.email === body.email && user.isEmailVerified) {
    const profile = toUserResponse(user, await flatLocationOf(user.id));

    const verifiedRecently =
      user.emailVerifiedAt !== null &&
      Date.now() - user.emailVerifiedAt.getTime() <= SESSION_RECOVERY_WINDOW_MS;
    if (!verifiedRecently) {
      return profile;
    }

    // Proof of a fresh OTP round for this exact address, not just "some
    // non-empty string" — see the doc comment on SESSION_RECOVERY_WINDOW_MS.
    // An invalid or foreign token must mint nothing and throw, same as the
    // real-swap branch below.
    await assertVerificationTokenIsValid(body.email, body.verificationToken);
    await consumeVerificationToken(body.email, body.verificationToken);

    const customToken = await firebaseAuth.createCustomToken(user.firebaseUid);
    return { ...profile, customToken };
  }

  // No deletedAt filter, for the reason findIdentityOwners gives: the column is
  // unique across soft-deleted rows too, and this must refuse before the
  // Firebase swap and the token spend below, not fail on the row update after.
  const emailOwner = await prisma.user.findFirst({
    where: { email: body.email, id: { not: user.id } },
    select: { id: true },
  });
  if (emailOwner) {
    throw errors.conflict(EMAIL_TAKEN);
  }

  // Read-only, and BEFORE any mutation: a garbage or foreign token must be
  // refused here, not after moveFirebaseEmail has already moved the account
  // to an address nobody proved (and revoked the caller's own session) —
  // which is what let any signed-in user squat an arbitrary address on their
  // Firebase account and block its real owner from ever registering with it.
  // `consumeVerificationToken` re-checks the identical predicate right before
  // spending the token below, so this only front-loads an equivalent check —
  // it does not relax what "valid" means.
  await assertVerificationTokenIsValid(body.email, body.verificationToken);

  // Firebase next: a failure here (e.g. auth/email-already-exists) must not
  // burn the token.
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
  const user = await requireUser(decoded);

  assertOwnStorageUrl(body.idDocumentFrontUrl, decoded.uid, 'nanny-ids');
  if (body.idDocumentBackUrl) assertOwnStorageUrl(body.idDocumentBackUrl, decoded.uid, 'nanny-ids');

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
