import type { ReclaimEmailRequest } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { firebaseAuth, type DecodedIdToken } from '@backend/lib/firebase';
import { isUserNotFound } from '@backend/services/account-deletion.service';
import { assertVerificationTokenIsValid } from '@backend/services/email-verification.service';

/**
 * Cleaning up after an "unfinished" sign-up: a Firebase account that exists
 * with no matching `users` row, because the wizard was abandoned before
 * `/auth/register` ran. Left alone, it permanently squats the email/phone it
 * signed up with — nobody else can register with them, and its own owner has
 * no route back in without a fresh phone/email verification.
 *
 * Discarding the caller's own unfinished account is the no-row branch of
 * `deleteMe` in account-deletion.service.ts.
 */

const EMAIL_TAKEN = 'An account with this email already exists. Sign in instead.';

/** Any row — live or soft-deleted — means the uid is not an unfinished sign-up. */
async function hasAnyRow(firebaseUid: string): Promise<boolean> {
  const row = await prisma.user.findFirst({ where: { firebaseUid }, select: { id: true } });
  return row !== null;
}

/**
 * Lets an unfinished sign-up (the caller) take over an email address that
 * another unfinished sign-up is squatting, once the caller has proven she
 * owns it. This is what unblocks registration when a prior abandoned wizard
 * left a Firebase account holding the address she now wants to use.
 *
 * Every branch below refuses to touch anything but another *unfinished*
 * Firebase identity: a disabled account, one with a `users` row (live or
 * soft-deleted), or an email a live row already holds are all left alone —
 * only a genuinely row-less, enabled Firebase account is ever deleted here.
 */
export async function reclaimEmail(
  decoded: DecodedIdToken,
  body: ReclaimEmailRequest,
): Promise<void> {
  // Already trimmed and lowercased by ReclaimEmailRequestSchema.
  const { email } = body;
  // Read-only, and before any lookup below: a garbage or foreign token must
  // be refused up front, not after we've already decided who the holder is.
  await assertVerificationTokenIsValid(email, body.emailVerificationToken);

  if (await hasAnyRow(decoded.uid)) throw errors.conflict(EMAIL_TAKEN);

  let holder;
  try {
    holder = await firebaseAuth.getUserByEmail(email);
  } catch (err) {
    if (isUserNotFound(err)) return;
    throw err;
  }
  if (holder.uid === decoded.uid) return;
  if (holder.disabled) throw errors.conflict(EMAIL_TAKEN);
  if (await hasAnyRow(holder.uid)) throw errors.conflict(EMAIL_TAKEN);

  const rowOwner = await prisma.user.findFirst({
    where: { email, deletedAt: null },
    select: { id: true },
  });
  if (rowOwner) throw errors.conflict(EMAIL_TAKEN);

  await firebaseAuth.deleteUser(holder.uid);
  console.warn('[auth] reclaimed email from an unfinished account', {
    email,
    deletedUid: holder.uid,
    byUid: decoded.uid,
  });
}
