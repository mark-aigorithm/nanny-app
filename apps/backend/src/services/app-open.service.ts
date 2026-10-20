import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import type { DecodedIdToken } from '@backend/lib/firebase';

/**
 * Records that the user opened the app. One conditional UPDATE: a ping within
 * 60 seconds of the stored time writes nothing, so a burst of foreground
 * events from one device costs one row write a minute at most. `now()` is the
 * database clock, the same one the condition compares against.
 */
export async function recordAppOpen(userId: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE users SET last_app_open_at = now()
    WHERE id = ${userId}
      AND (last_app_open_at IS NULL OR last_app_open_at < now() - interval '60 seconds')`;
}

/** POST /me/app-open — resolves the signed-in user's row, then records the open. */
export async function recordMyAppOpen(decoded: DecodedIdToken): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { firebaseUid: decoded.uid, deletedAt: null },
    select: { id: true },
  });
  if (!user) throw errors.unauthorized();
  await recordAppOpen(user.id);
}
