jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    booking: { findFirst: jest.fn(), update: jest.fn() },
    camera: { findFirst: jest.fn() },
  },
}));

jest.mock('@backend/lib/stream-probe', () => ({
  probeStream: jest.fn(),
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn(),
  dispatchPush: jest.fn(),
}));

import { BookingStatus } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import type { DecodedIdToken } from '@backend/lib/firebase';
import { probeStream } from '@backend/lib/stream-probe';
import {
  getBookingCamera,
  notifyNannyToStartCamera,
} from '@backend/services/booking-camera.service';
import {
  createInAppNotification,
  dispatchPush,
} from '@backend/services/notification.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  booking: { findFirst: jest.Mock; update: jest.Mock };
  camera: { findFirst: jest.Mock };
};
const mockProbe = probeStream as jest.Mock;
const mockCreateNotification = createInAppNotification as jest.Mock;
const mockDispatchPush = dispatchPush as jest.Mock;

const PARENT_ID = 10;
const NANNY_USER_ID = 20;
const BOOKING_ID = 99;

const decoded = { uid: 'parent-uid' } as DecodedIdToken;

const CAMERA = {
  id: 5,
  name: 'Nursery',
  streamUrl: 'rtsp://cam.example.com:554/live',
};

/** Booking as loaded by the service; only the selected fields matter. */
function makeBooking(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: BOOKING_ID,
    motherId: PARENT_ID,
    status: BookingStatus.IN_PROGRESS,
    cameraNotifiedAt: null,
    nannyProfile: { userId: NANNY_USER_ID },
    ...overrides,
  };
}

function expectRejection(promise: Promise<unknown>, statusCode: number) {
  return expect(promise).rejects.toMatchObject({ statusCode });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue({ id: PARENT_ID, deletedAt: null });
  mockPrisma.booking.findFirst.mockResolvedValue(makeBooking());
  mockPrisma.booking.update.mockResolvedValue({});
  mockPrisma.camera.findFirst.mockResolvedValue(CAMERA);
  mockProbe.mockResolvedValue({ online: true, checkedAt: new Date('2026-07-20T10:00:00Z') });
});

describe('getBookingCamera', () => {
  it('returns the stream and probe result for the booking parent', async () => {
    const result = await getBookingCamera(decoded, BOOKING_ID);

    expect(result).toEqual({
      name: 'Nursery',
      streamUrl: 'rtsp://cam.example.com:554/live',
      online: true,
      checkedAt: '2026-07-20T10:00:00.000Z',
    });
  });

  it('passes null through when the probe could not parse the URL', async () => {
    mockProbe.mockResolvedValue({ online: null, checkedAt: new Date() });
    await expect(getBookingCamera(decoded, BOOKING_ID)).resolves.toMatchObject({
      online: null,
    });
  });

  it('resolves the camera through the booking nanny, not the booking itself', async () => {
    await getBookingCamera(decoded, BOOKING_ID);

    expect(mockPrisma.camera.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { nannyUserId: NANNY_USER_ID, deletedAt: null },
      }),
    );
  });

  it('picks the most recently added camera when a nanny has several', async () => {
    await getBookingCamera(decoded, BOOKING_ID);

    expect(mockPrisma.camera.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('refuses a user who is not the booking parent', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 999, deletedAt: null });
    await expectRejection(getBookingCamera(decoded, BOOKING_ID), 403);
  });

  it('refuses the nanny on the booking — the feed is the parent’s view only', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: NANNY_USER_ID, deletedAt: null });
    await expectRejection(getBookingCamera(decoded, BOOKING_ID), 403);
  });

  it.each([
    BookingStatus.CONFIRMED,
    BookingStatus.APPROVED,
    BookingStatus.PENDING,
    BookingStatus.COMPLETED,
    BookingStatus.CANCELLED,
  ])('refuses access while the booking is %s', async (status) => {
    mockPrisma.booking.findFirst.mockResolvedValue(makeBooking({ status }));
    await expectRejection(getBookingCamera(decoded, BOOKING_ID), 403);
  });

  it('never probes a camera the caller is not allowed to see', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeBooking({ status: BookingStatus.CONFIRMED }),
    );
    await expectRejection(getBookingCamera(decoded, BOOKING_ID), 403);
    expect(mockProbe).not.toHaveBeenCalled();
  });

  it('404s when the booking does not exist', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    await expectRejection(getBookingCamera(decoded, BOOKING_ID), 404);
  });

  it('404s when no nanny is assigned yet', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(makeBooking({ nannyProfile: null }));
    await expectRejection(getBookingCamera(decoded, BOOKING_ID), 404);
  });

  it('404s when the nanny has no camera set up', async () => {
    mockPrisma.camera.findFirst.mockResolvedValue(null);
    await expectRejection(getBookingCamera(decoded, BOOKING_ID), 404);
  });

  it('401s for a deleted user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: PARENT_ID, deletedAt: new Date() });
    await expectRejection(getBookingCamera(decoded, BOOKING_ID), 401);
  });
});

describe('notifyNannyToStartCamera', () => {
  it('notifies the nanny and records the time', async () => {
    const result = await notifyNannyToStartCamera(decoded, BOOKING_ID);

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: NANNY_USER_ID,
        type: 'CAMERA_REQUESTED',
        referenceId: BOOKING_ID,
      }),
    );
    expect(mockDispatchPush).toHaveBeenCalledWith(
      NANNY_USER_ID,
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'camera_requested',
          bookingId: String(BOOKING_ID),
        }),
      }),
    );
    expect(mockPrisma.booking.update).toHaveBeenCalledWith({
      where: { id: BOOKING_ID },
      data: { cameraNotifiedAt: expect.any(Date) },
    });
    expect(result.notifiedAt).toEqual(expect.any(String));
  });

  it('rejects a second nudge inside the cooldown', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeBooking({ cameraNotifiedAt: new Date(Date.now() - 30_000) }),
    );

    await expectRejection(notifyNannyToStartCamera(decoded, BOOKING_ID), 429);
    expect(mockDispatchPush).not.toHaveBeenCalled();
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it('allows another nudge once the cooldown has elapsed', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeBooking({ cameraNotifiedAt: new Date(Date.now() - 10 * 60_000) }),
    );

    await expect(notifyNannyToStartCamera(decoded, BOOKING_ID)).resolves.toBeDefined();
    expect(mockDispatchPush).toHaveBeenCalled();
  });

  it('tells the parent how long is left when it refuses', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeBooking({ cameraNotifiedAt: new Date(Date.now() - 60_000) }),
    );

    // 300s cooldown minus the 60s elapsed → roughly 240s remaining.
    await expect(notifyNannyToStartCamera(decoded, BOOKING_ID)).rejects.toThrow(/24\d seconds/);
  });

  it('still succeeds when the nanny has no device token registered', async () => {
    // dispatchPush swallows its own errors, but guard the contract anyway.
    mockDispatchPush.mockResolvedValue(undefined);
    await expect(notifyNannyToStartCamera(decoded, BOOKING_ID)).resolves.toBeDefined();
    expect(mockCreateNotification).toHaveBeenCalled();
  });

  it('refuses when the booking is not in progress', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeBooking({ status: BookingStatus.CONFIRMED }),
    );
    await expectRejection(notifyNannyToStartCamera(decoded, BOOKING_ID), 403);
  });

  it('refuses a user who is not the booking parent', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 999, deletedAt: null });
    await expectRejection(notifyNannyToStartCamera(decoded, BOOKING_ID), 403);
  });

  it('404s when the nanny has no camera to turn on', async () => {
    mockPrisma.camera.findFirst.mockResolvedValue(null);
    await expectRejection(notifyNannyToStartCamera(decoded, BOOKING_ID), 404);
    expect(mockDispatchPush).not.toHaveBeenCalled();
  });
});
