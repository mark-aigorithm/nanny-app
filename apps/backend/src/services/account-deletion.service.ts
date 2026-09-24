import { randomUUID } from 'node:crypto';

import { BookingStatus, Role } from '@prisma/client';
import type { DeleteMeRequest } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { firebaseAuth, type DecodedIdToken } from '@backend/lib/firebase';

/**
 * DELETE /auth/me — a mother or nanny deleting her own account (an App Store
 * requirement), or an unfinished sign-up discarding its Firebase identity.
 *
 * Deletion is immediate: the `users` row is soft-deleted with its email,
 * phone and uid scrambled so all three can be registered again, and the
 * Firebase user is deleted — the one hard delete. The nanny profile (out of
 * search) and device tokens (no more pushes) are soft-deleted with it;
 * everything else stays linked to the scrambled row.
 */

const CANT_REMOVE = "This account can't be removed here.";
const HAS_BOOKINGS = 'Finish or cancel your upcoming bookings before deleting your account.';
const STAFF = 'Staff accounts are removed from the admin console.';

/** A booking in any of these still needs both of its parties. */
const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.APPROVED,
  BookingStatus.PENDING_CONFIRMATION,
  BookingStatus.CONFIRMED,
  BookingStatus.IN_PROGRESS,
];

const SELF_DELETABLE_ROLES: ReadonlySet<Role> = new Set([Role.MOTHER, Role.NANNY]);

export function isUserNotFound(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 'auth/user-not-found';
}

/** Deletes a Firebase user; one that is already gone counts as success. */
async function deleteFirebaseUser(uid: string): Promise<void> {
  try {
    await firebaseAuth.deleteUser(uid);
  } catch (err) {
    if (!isUserNotFound(err)) throw err;
  }
}

/**
 * Replacement values for the row's three unique identity columns. The
 * `.invalid` TLD can never receive mail, and the id plus a UUID keeps them
 * collision-free even if a row is deleted twice; a null phone frees it
 * outright.
 */
export function scrambleIdentity(userId: number): { email: string; phone: null; firebaseUid: string } {
  return {
    email: `deleted-${userId}-${randomUUID()}@deleted.nannyapp.invalid`,
    phone: null,
    firebaseUid: `deleted:${userId}:${randomUUID()}`,
  };
}

export async function deleteMe(decoded: DecodedIdToken, body: DeleteMeRequest): Promise<void> {
  // No deletedAt filter: a soft-deleted row must be found so it is refused.
  const row = await prisma.user.findFirst({
    where: { firebaseUid: decoded.uid },
    select: { id: true, role: true, deletedAt: true, nannyProfile: { select: { id: true } } },
  });

  // Unfinished sign-up — the wizard was abandoned before /auth/register, so
  // only the Firebase identity exists. This is also how a retry finishes a
  // deletion whose Firebase step failed: the row's uid is scrambled by then.
  if (!row) {
    await deleteFirebaseUser(decoded.uid);
    return;
  }

  // Already soft-deleted (e.g. removed by an admin, uid never scrambled).
  if (row.deletedAt) throw errors.conflict(CANT_REMOVE);
  // A bodiless call is a discard; it must never delete a real account.
  if (body.confirm !== 'delete-my-account') throw errors.conflict(CANT_REMOVE);
  if (!row.role || !SELF_DELETABLE_ROLES.has(row.role)) throw errors.forbidden(STAFF);

  const firebaseUser = await firebaseAuth.getUser(decoded.uid);
  const appleLinked = firebaseUser.providerData.some((p) => p.providerId === 'apple.com');

  const nannyProfileId = row.nannyProfile?.id;
  await prisma.$transaction(async (tx) => {
    const activeBookings = await tx.booking.count({
      where: {
        status: { in: ACTIVE_BOOKING_STATUSES },
        OR: [{ motherId: row.id }, ...(nannyProfileId !== undefined ? [{ nannyProfileId }] : [])],
      },
    });
    if (activeBookings > 0) throw errors.conflict(HAS_BOOKINGS);

    const now = new Date();
    await tx.user.update({
      where: { id: row.id },
      data: { ...scrambleIdentity(row.id), deletedAt: now, deletionRequestedAt: now, isActive: false },
    });
    if (nannyProfileId !== undefined) {
      await tx.nannyProfile.update({ where: { id: nannyProfileId }, data: { deletedAt: now } });
    }
    await tx.deviceToken.updateMany({
      where: { userId: row.id, deletedAt: null },
      data: { deletedAt: now },
    });
  });

  // Logged once the row is gone, before the Firebase step, so the record
  // survives that step failing. warn, so an Android deletion with Apple
  // linked and no revoke shows up.
  console.warn('[auth] account deleted', {
    userId: row.id,
    role: row.role,
    appleLinked,
    appleRevoked: body.appleRevoked === true,
  });

  // After the commit. Any failure other than "already gone" surfaces as a 500
  // so the client retries — and the retry lands in the no-row branch above.
  await deleteFirebaseUser(decoded.uid);
}
