import {
  BookingStatus,
  CAMERA_NOTIFY_COOLDOWN_SECONDS,
  type BookingCamera,
  type NotifyCameraResponse,
} from '@nanny-app/shared';
import { NotificationReferenceType, NotificationType } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import type { DecodedIdToken } from '@backend/lib/firebase';
import { probeStream } from '@backend/lib/stream-probe';

import { createInAppNotification, dispatchPush } from './notification.service';

/**
 * Parent-facing live camera access for an in-progress booking.
 *
 * Cameras belong to a nanny (Camera.nannyUserId), not to a booking, so a
 * booking resolves to a feed through its assigned nanny. That matches how
 * admins actually manage cameras and means reassigning a booking automatically
 * follows the new nanny's camera.
 */

/** The booking + nanny shape both operations need. */
async function loadBooking(uid: string, bookingId: number) {
  const user = await prisma.user.findUnique({ where: { firebaseUid: uid } });
  if (!user || user.deletedAt) throw errors.unauthorized();

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, deletedAt: null },
    select: {
      id: true,
      motherId: true,
      status: true,
      cameraNotifiedAt: true,
      nannyProfile: { select: { userId: true } },
    },
  });
  if (!booking) throw errors.notFound('Booking not found');

  // Parent-only: the nanny has no reason to watch their own feed, and this is
  // the parent's window into someone else's home. Deliberately narrower than
  // the shared owner-or-nanny check used elsewhere.
  if (booking.motherId !== user.id) throw errors.forbidden('Access denied.');

  if (booking.status !== BookingStatus.IN_PROGRESS) {
    throw errors.forbidden('The live feed is only available while the booking is in progress.');
  }

  const nannyUserId = booking.nannyProfile?.userId;
  if (!nannyUserId) throw errors.notFound('No nanny is assigned to this booking.');

  return { booking, nannyUserId };
}

/** Most recently added active camera for a nanny, or null. */
async function findNannyCamera(nannyUserId: number) {
  return prisma.camera.findFirst({
    where: { nannyUserId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, streamUrl: true },
  });
}

export async function getBookingCamera(
  decoded: DecodedIdToken,
  bookingId: number,
): Promise<BookingCamera> {
  const { nannyUserId } = await loadBooking(decoded.uid, bookingId);

  const camera = await findNannyCamera(nannyUserId);
  if (!camera) throw errors.notFound('No camera is set up for this nanny.');

  const { online, checkedAt } = await probeStream(camera.id, camera.streamUrl);

  return {
    name: camera.name,
    streamUrl: camera.streamUrl,
    online,
    checkedAt: checkedAt.toISOString(),
  };
}

export async function notifyNannyToStartCamera(
  decoded: DecodedIdToken,
  bookingId: number,
): Promise<NotifyCameraResponse> {
  const { booking, nannyUserId } = await loadBooking(decoded.uid, bookingId);

  const camera = await findNannyCamera(nannyUserId);
  if (!camera) throw errors.notFound('No camera is set up for this nanny.');

  // Cooldown: a worried parent will tap this repeatedly, and the nanny is
  // holding a child. One nudge per window is plenty.
  //
  // Claimed with a conditional update rather than a read-then-write: a
  // double-tap fires two near-simultaneous requests, and a plain check would
  // let both read the old timestamp and both push.
  const notifiedAt = new Date();
  const cutoff = new Date(notifiedAt.getTime() - CAMERA_NOTIFY_COOLDOWN_SECONDS * 1000);

  const claimed = await prisma.booking.updateMany({
    where: {
      id: booking.id,
      OR: [{ cameraNotifiedAt: null }, { cameraNotifiedAt: { lt: cutoff } }],
    },
    data: { cameraNotifiedAt: notifiedAt },
  });

  if (claimed.count === 0) {
    const last = booking.cameraNotifiedAt;
    const wait = last
      ? Math.max(
          1,
          Math.ceil(CAMERA_NOTIFY_COOLDOWN_SECONDS - (Date.now() - last.getTime()) / 1000),
        )
      : CAMERA_NOTIFY_COOLDOWN_SECONDS;
    throw errors.tooManyRequests(
      `You've already asked. You can send another reminder in ${wait} seconds.`,
    );
  }

  const title = 'Camera request';
  const body = 'The parent has asked you to turn on the camera for this booking.';

  await createInAppNotification({
    userId: nannyUserId,
    type: NotificationType.CAMERA_REQUESTED,
    title,
    body,
    referenceId: booking.id,
    referenceType: NotificationReferenceType.BOOKING,
  });

  // dispatchPush swallows its own errors, so a nanny with no registered device
  // token still gets the in-app notification and this call still succeeds.
  await dispatchPush(nannyUserId, {
    title,
    body,
    data: {
      type: 'camera_requested',
      bookingId: String(booking.id),
      title,
    },
  });

  return { notifiedAt: notifiedAt.toISOString() };
}
