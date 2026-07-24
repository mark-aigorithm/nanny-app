import { Role } from '@nanny-app/shared';
import { BookingStatus as PrismaBookingStatus } from '@prisma/client';

import {
  applyPaidExtension,
  cancelBookingExtension,
  requestBookingExtension,
  respondToBookingExtension,
} from '@backend/services/booking-extension.service';

jest.mock('@backend/db/prisma', () => {
  const bookingExtension = {
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
  };
  return {
    prisma: {
      user: { findUnique: jest.fn() },
      booking: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      bookingExtension,
      appSettings: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      packagePurchase: { findMany: jest.fn().mockResolvedValue([]) },
      packageHoursLedger: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      // The extension flows run their writes in a transaction; hand the callback
      // the same mock client so assertions see every call in one place.
      $transaction: jest.fn(),
    },
  };
});

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@backend/services/reward.service', () => ({
  applyBookingRedemption: jest.fn(),
  notifyPointsRedeemed: jest.fn().mockResolvedValue(undefined),
  notifyPointsRefunded: jest.fn().mockResolvedValue(undefined),
  refundBookingRedemption: jest.fn().mockResolvedValue(undefined),
  awardPointsForBooking: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@backend/services/package-hours.service', () => ({
  getAvailableHours: jest.fn().mockResolvedValue(0),
  getRedeemableSummary: jest.fn().mockResolvedValue({ availableHours: 0, maxSkillsAllowed: 0 }),
  redeemPackageHours: jest.fn(),
  refundPackageHours: jest.fn().mockResolvedValue(0),
}));

jest.mock('@backend/services/referral.service', () => ({
  convertReferralForBooking: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@backend/db/prisma';
import { createInAppNotification, dispatchPush } from '@backend/services/notification.service';
import { refundPackageHours } from '@backend/services/package-hours.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  booking: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  bookingExtension: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  appSettings: { findMany: jest.Mock };
  $transaction: jest.Mock;
};

const mockNotify = createInAppNotification as jest.Mock;
const mockPush = dispatchPush as jest.Mock;
const mockRefundHours = refundPackageHours as jest.Mock;

const motherUser = { id: 10, firebaseUid: 'firebase-mother', role: Role.MOTHER, deletedAt: null };
const nannyUser = { id: 16, firebaseUid: 'firebase-nanny', role: Role.NANNY, deletedAt: null };

/**
 * A shift running 10:00–14:00 platform time today. Well inside the default
 * 6:00–23:00 window, so the window rule only bites in the tests that push
 * the end time deliberately late.
 */
function makeBooking(overrides: Partial<{ status: string; endHour: number; durationHours: number }> = {}) {
  const start = new Date();
  start.setUTCHours(8, 0, 0, 0); // 10:00 Cairo (UTC+2)
  const endHour = overrides.endHour ?? 12; // 14:00 Cairo
  const end = new Date(start);
  end.setUTCHours(endHour, 0, 0, 0);

  return {
    id: 4,
    motherId: motherUser.id,
    status: overrides.status ?? PrismaBookingStatus.IN_PROGRESS,
    startTime: start,
    endTime: end,
    durationHours: overrides.durationHours ?? 4,
    baseRate: 100,
    effectiveHourlyRate: 120,
    childrenCount: 1,
    extraChildren: 0,
    extraChildFeePerHour: 0,
    bookedChildren: null,
    selectedSkillFees: null,
    nannyProfileId: 19,
    mother: { id: motherUser.id, firstName: 'Jane', lastName: 'Mom' },
    nannyProfile: { id: 19, userId: nannyUser.id, user: { firstName: 'Elena' } },
  };
}

function makeExtension(overrides: Record<string, unknown> = {}) {
  return {
    id: 77,
    bookingId: 4,
    motherId: motherUser.id,
    status: 'PENDING_NANNY',
    hours: 2,
    newEndTime: new Date(),
    hourlyRate: 120,
    subtotal: 240,
    discountAmount: 0,
    packageHoursApplied: 0,
    packageSkillsCovered: 0,
    packageCreditAmount: 0,
    rewardCreditHoursApplied: 0,
    rewardCreditPoints: 0,
    rewardCreditAmount: 0,
    totalAmount: 240,
    nannyAmount: 168,
    platformAmount: 72,
    requestedAt: new Date(),
    nannyRespondedAt: null,
    expiresAt: new Date(Date.now() + 15 * 60_000),
    paidAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.appSettings.findMany.mockResolvedValue([]);
  mockPrisma.bookingExtension.findFirst.mockResolvedValue(null);
  mockPrisma.bookingExtension.findMany.mockResolvedValue([]);
  mockPrisma.booking.findFirst.mockResolvedValue(null);
  mockRefundHours.mockResolvedValue(0);
  // Run transaction callbacks against the same mock client.
  mockPrisma.$transaction.mockImplementation(async (fn: unknown) =>
    typeof fn === 'function' ? (fn as (c: unknown) => unknown)(mockPrisma) : undefined,
  );
});

describe('requestBookingExtension', () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue(motherUser);
    mockPrisma.booking.findUnique.mockResolvedValue(makeBooking());
  });

  it('creates a PENDING_NANNY quote priced off the booking’s frozen hourly rate', async () => {
    mockPrisma.bookingExtension.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(makeExtension(data)),
    );

    await requestBookingExtension({ uid: 'firebase-mother' } as never, 4, { hours: 2 });

    const { data } = mockPrisma.bookingExtension.create.mock.calls[0][0];
    expect(data.status).toBe('PENDING_NANNY');
    expect(data.hours).toBe(2);
    // 2h × the booking's effectiveHourlyRate (120), NOT the base rate.
    expect(data.hourlyRate).toBe(120);
    expect(data.subtotal).toBe(240);
    expect(data.totalAmount).toBe(240);
  });

  it('reserves no credits at request time — nothing is spent until the nanny agrees', async () => {
    mockPrisma.bookingExtension.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(makeExtension(data)),
    );

    await requestBookingExtension({ uid: 'firebase-mother' } as never, 4, { hours: 2 });

    const { data } = mockPrisma.bookingExtension.create.mock.calls[0][0];
    expect(data.packageHoursApplied).toBeUndefined();
    expect(data.rewardCreditPoints).toBeUndefined();
    expect(data.discountAmount).toBeUndefined();
  });

  it('notifies the nanny with the extension id she needs to answer', async () => {
    mockPrisma.bookingExtension.create.mockResolvedValue(makeExtension());

    await requestBookingExtension({ uid: 'firebase-mother' } as never, 4, { hours: 2 });

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: nannyUser.id, type: 'BOOKING_EXTENSION_REQUESTED' }),
    );
    expect(mockPush).toHaveBeenCalledWith(
      nannyUser.id,
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'booking_extension_requested',
          extensionId: '77',
        }),
      }),
    );
  });

  it('refuses hours that would run past the end of the daily booking window', async () => {
    // Ends 22:00 Cairo; +3h would be 01:00, outside the default 6:00–23:00 window.
    mockPrisma.booking.findUnique.mockResolvedValue(
      makeBooking({ endHour: 20, durationHours: 12 }),
    );

    await expect(
      requestBookingExtension({ uid: 'firebase-mother' } as never, 4, { hours: 3 }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockPrisma.bookingExtension.create).not.toHaveBeenCalled();
  });

  it('refuses hours that would exceed the maximum booking duration', async () => {
    // Default max is 12h; an 11h booking can only take 1 more.
    mockPrisma.booking.findUnique.mockResolvedValue(
      makeBooking({ endHour: 19, durationHours: 11 }),
    );

    await expect(
      requestBookingExtension({ uid: 'firebase-mother' } as never, 4, { hours: 2 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses a booking that is not under way', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      makeBooking({ status: PrismaBookingStatus.CONFIRMED }),
    );

    await expect(
      requestBookingExtension({ uid: 'firebase-mother' } as never, 4, { hours: 1 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses a second request while one is still in flight', async () => {
    mockPrisma.bookingExtension.findFirst.mockResolvedValue(makeExtension());

    await expect(
      requestBookingExtension({ uid: 'firebase-mother' } as never, 4, { hours: 1 }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.bookingExtension.create).not.toHaveBeenCalled();
  });

  it('rejects a nanny using the parent route', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(nannyUser);

    await expect(
      requestBookingExtension({ uid: 'firebase-nanny' } as never, 4, { hours: 1 }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('respondToBookingExtension', () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue(nannyUser);
    mockPrisma.booking.findUnique.mockResolvedValue(makeBooking());
  });

  it('moves an accepted request to ACCEPTED and starts the payment clock', async () => {
    const pending = makeExtension();
    mockPrisma.bookingExtension.findFirst
      .mockResolvedValueOnce(pending) // expireIfPastDeadline
      .mockResolvedValue(pending);
    mockPrisma.bookingExtension.update.mockResolvedValue(makeExtension({ status: 'ACCEPTED' }));

    await respondToBookingExtension({ uid: 'firebase-nanny' } as never, 77, true);

    const accepted = mockPrisma.bookingExtension.update.mock.calls.find(
      (c: [{ data: Record<string, unknown> }]) => c[0].data.status === 'ACCEPTED',
    );
    expect(accepted).toBeDefined();
    expect(accepted![0].data.expiresAt).toBeInstanceOf(Date);
    expect(accepted![0].data.nannyRespondedAt).toBeInstanceOf(Date);
  });

  it('tells the mother the amount she now owes', async () => {
    const pending = makeExtension();
    mockPrisma.bookingExtension.findFirst.mockResolvedValue(pending);
    mockPrisma.bookingExtension.update.mockResolvedValue(makeExtension({ status: 'ACCEPTED' }));

    await respondToBookingExtension({ uid: 'firebase-nanny' } as never, 77, true);

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: motherUser.id,
        type: 'BOOKING_EXTENSION_ACCEPTED',
      }),
    );
    expect(mockPush).toHaveBeenCalledWith(
      motherUser.id,
      expect.objectContaining({
        body: expect.stringContaining('240'),
        data: expect.objectContaining({ type: 'booking_extension_accepted', extensionId: '77' }),
      }),
    );
  });

  it('declining settles the request and returns any reserved hours', async () => {
    mockPrisma.bookingExtension.findFirst.mockResolvedValue(makeExtension());
    mockPrisma.bookingExtension.update.mockResolvedValue(makeExtension({ status: 'DECLINED' }));

    await respondToBookingExtension({ uid: 'firebase-nanny' } as never, 77, false);

    expect(mockRefundHours).toHaveBeenCalledWith(expect.anything(), { bookingExtensionId: 77 });
    const declined = mockPrisma.bookingExtension.update.mock.calls.find(
      (c: [{ data: Record<string, unknown> }]) => c[0].data.status === 'DECLINED',
    );
    expect(declined).toBeDefined();
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'BOOKING_EXTENSION_DECLINED' }),
    );
  });

  it('refuses to answer a request that is no longer pending', async () => {
    mockPrisma.bookingExtension.findFirst.mockResolvedValue(
      makeExtension({ status: 'ACCEPTED' }),
    );

    await expect(
      respondToBookingExtension({ uid: 'firebase-nanny' } as never, 77, true),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a nanny who is not on the booking', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...nannyUser, id: 99 });
    mockPrisma.bookingExtension.findFirst.mockResolvedValue(makeExtension());

    await expect(
      respondToBookingExtension({ uid: 'firebase-nanny' } as never, 77, true),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects a mother trying to accept on the nanny’s behalf', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(motherUser);

    await expect(
      respondToBookingExtension({ uid: 'firebase-mother' } as never, 77, true),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

// The only place an extension changes the booking. Everything here is about
// money and hours actually moving, so the guards matter more than the happy path.
describe('applyPaidExtension', () => {
  const bookingRow = {
    id: 4,
    status: PrismaBookingStatus.IN_PROGRESS,
    endTime: new Date('2026-07-24T12:00:00.000Z'),
    durationHours: 4,
    subtotal: 480,
    discountAmount: 0,
    totalAmount: 480,
    nannyAmount: 336,
    platformAmount: 144,
    packageHoursApplied: 0,
    packageCreditAmount: 0,
    rewardCreditHoursApplied: 0,
    rewardCreditPoints: 0,
    rewardCreditAmount: 0,
  };

  it('moves the end time out and folds the extension into the booking’s totals', async () => {
    const newEnd = new Date('2026-07-24T14:00:00.000Z');
    mockPrisma.bookingExtension.findFirst.mockResolvedValue(
      makeExtension({ status: 'ACCEPTED', newEndTime: newEnd, hours: 2 }),
    );
    mockPrisma.booking.findUnique.mockResolvedValue(bookingRow);
    mockPrisma.bookingExtension.update.mockResolvedValue(makeExtension({ status: 'PAID' }));

    await applyPaidExtension(77);

    const { data } = mockPrisma.booking.update.mock.calls[0][0];
    expect(data.endTime).toBe(newEnd);
    expect(data.durationHours).toBe(6); // 4 + 2
    expect(data.subtotal).toBe(720); // 480 + 240
    expect(data.totalAmount).toBe(720);
    expect(data.nannyAmount).toBe(504); // 336 + 168
    expect(data.platformAmount).toBe(216); // 144 + 72
  });

  it('marks the extension PAID with a timestamp', async () => {
    mockPrisma.bookingExtension.findFirst.mockResolvedValue(
      makeExtension({ status: 'ACCEPTED' }),
    );
    mockPrisma.booking.findUnique.mockResolvedValue(bookingRow);
    mockPrisma.bookingExtension.update.mockResolvedValue(makeExtension({ status: 'PAID' }));

    await applyPaidExtension(77);

    const { data } = mockPrisma.bookingExtension.update.mock.calls[0][0];
    expect(data.status).toBe('PAID');
    expect(data.paidAt).toBeInstanceOf(Date);
  });

  it('is a no-op on replay, so a repeated webhook cannot add the hours twice', async () => {
    mockPrisma.bookingExtension.findFirst.mockResolvedValue(makeExtension({ status: 'PAID' }));

    await applyPaidExtension(77);

    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    expect(mockPrisma.bookingExtension.update).not.toHaveBeenCalled();
  });

  it('refuses to apply an extension the nanny never accepted', async () => {
    mockPrisma.bookingExtension.findFirst.mockResolvedValue(
      makeExtension({ status: 'PENDING_NANNY' }),
    );

    await applyPaidExtension(77);

    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it('leaves a booking that already ended untouched rather than reopening it', async () => {
    mockPrisma.bookingExtension.findFirst.mockResolvedValue(
      makeExtension({ status: 'ACCEPTED' }),
    );
    mockPrisma.booking.findUnique.mockResolvedValue({
      ...bookingRow,
      status: PrismaBookingStatus.COMPLETED,
    });

    await applyPaidExtension(77);

    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    expect(mockPrisma.bookingExtension.update).not.toHaveBeenCalled();
  });
});

describe('cancelBookingExtension', () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue(motherUser);
  });

  it('withdraws the request and hands back reserved hours', async () => {
    mockPrisma.bookingExtension.findFirst.mockResolvedValue(
      makeExtension({ status: 'ACCEPTED', packageHoursApplied: 2 }),
    );
    mockPrisma.bookingExtension.update.mockResolvedValue(makeExtension({ status: 'CANCELLED' }));

    await cancelBookingExtension({ uid: 'firebase-mother' } as never, 77);

    expect(mockRefundHours).toHaveBeenCalledWith(expect.anything(), { bookingExtensionId: 77 });
    const cancelled = mockPrisma.bookingExtension.update.mock.calls.find(
      (c: [{ data: Record<string, unknown> }]) => c[0].data.status === 'CANCELLED',
    );
    expect(cancelled).toBeDefined();
    // The reservation columns are zeroed so the row can't be read as still holding them.
    expect(cancelled![0].data.packageHoursApplied).toBe(0);
    expect(cancelled![0].data.rewardCreditPoints).toBe(0);
  });

  it('refuses to withdraw an extension that is already paid for', async () => {
    mockPrisma.bookingExtension.findFirst.mockResolvedValue(makeExtension({ status: 'PAID' }));

    await expect(
      cancelBookingExtension({ uid: 'firebase-mother' } as never, 77),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a mother who does not own the request', async () => {
    mockPrisma.bookingExtension.findFirst.mockResolvedValue(makeExtension({ motherId: 999 }));

    await expect(
      cancelBookingExtension({ uid: 'firebase-mother' } as never, 77),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
