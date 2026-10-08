import { Role } from '@nanny-app/shared';
import { BookingStatus as PrismaBookingStatus } from '@prisma/client';

import {
  BOOKING_EXTENSION_NANNY_RESPONSE_MINUTES,
  BOOKING_EXTENSION_PAYMENT_MINUTES,
  BOOKING_EXTENSION_PRESET_HOURS as SHARED_PRESET_HOURS,
} from '@nanny-app/shared';

import {
  applyPaidExtension,
  BOOKING_EXTENSION_PRESET_HOURS,
  cancelBookingExtension,
  expireStaleBookingExtensions,
  getBookingExtension,
  redeemExtensionPoints,
  requestBookingExtension,
  respondToBookingExtension,
  startBookingExtensionExpiryScheduler,
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
import { config } from '@backend/lib/config';
import { createInAppNotification, dispatchPush } from '@backend/services/notification.service';
import {
  getRedeemableSummary,
  redeemPackageHours,
  refundPackageHours,
} from '@backend/services/package-hours.service';
import {
  applyBookingRedemption,
  notifyPointsRedeemed,
  notifyPointsRefunded,
  refundBookingRedemption,
} from '@backend/services/reward.service';

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
const mockRedeemableSummary = getRedeemableSummary as jest.Mock;
const mockRedeemHours = redeemPackageHours as jest.Mock;
const mockApplyRedemption = applyBookingRedemption as jest.Mock;
const mockNotifyRedeemed = notifyPointsRedeemed as jest.Mock;
const mockNotifyRefunded = notifyPointsRefunded as jest.Mock;
const mockRefundRedemption = refundBookingRedemption as jest.Mock;

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
  mockRedeemableSummary.mockReset().mockResolvedValue({ availableHours: 0, maxSkillsAllowed: 0 });
  mockRedeemHours.mockReset();
  mockApplyRedemption.mockReset();
  mockPrisma.bookingExtension.update.mockReset();
  mockPrisma.booking.findUnique.mockReset();
  mockPrisma.booking.update.mockReset();
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

  it('declining tells the mother gently and points her at a new booking', async () => {
    mockPrisma.bookingExtension.findFirst.mockResolvedValue(makeExtension());
    mockPrisma.bookingExtension.update.mockResolvedValue(makeExtension({ status: 'DECLINED' }));

    await respondToBookingExtension({ uid: 'firebase-nanny' } as never, 77, false);

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: motherUser.id,
        type: 'BOOKING_EXTENSION_DECLINED',
        title: "Elena can't stay longer",
        body: expect.stringContaining('book a new session'),
      }),
    );
    expect(mockPush).toHaveBeenCalledWith(
      motherUser.id,
      expect.objectContaining({
        title: "Elena can't stay longer",
        body: expect.stringContaining('book a new session'),
        data: expect.objectContaining({ type: 'booking_extension_declined', extensionId: '77' }),
      }),
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

// ── Shared fixtures for the flows below ──────────────────────────────────────

type ExtensionRow = ReturnType<typeof makeExtension>;

/**
 * Back the extensions table with one mutable row, so a flow that writes and
 * then re-reads (accept → reserve → settle) sees its own writes, the way the
 * database would.
 */
function trackExtension(initial: ExtensionRow): () => ExtensionRow {
  let row: ExtensionRow = { ...initial };
  mockPrisma.bookingExtension.findFirst.mockImplementation(() => Promise.resolve({ ...row }));
  mockPrisma.bookingExtension.update.mockImplementation(
    ({ data }: { data: Partial<ExtensionRow> }) => {
      row = { ...row, ...data };
      return Promise.resolve({ ...row });
    },
  );
  return () => row;
}

/** makeBooking plus the money columns applyPaidExtension folds the extension into. */
function makeFullBooking(overrides: Record<string, unknown> = {}) {
  return {
    ...makeBooking(),
    subtotal: 480,
    discountAmount: 0,
    totalAmount: 480,
    nannyAmount: 384,
    platformAmount: 96,
    packageHoursApplied: 0,
    packageCreditAmount: 0,
    rewardCreditHoursApplied: 0,
    rewardCreditPoints: 0,
    rewardCreditAmount: 0,
    ...overrides,
  };
}

const updatesWith = (status: string) =>
  mockPrisma.bookingExtension.update.mock.calls.filter(
    (c: [{ data: Record<string, unknown> }]) => c[0].data.status === status,
  );

describe('requestBookingExtension — guards and pricing', () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue(motherUser);
    mockPrisma.booking.findUnique.mockResolvedValue(makeBooking());
    mockPrisma.bookingExtension.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => Promise.resolve(makeExtension(data)),
    );
  });

  it('rejects a caller with no account', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(
      requestBookingExtension({ uid: 'ghost' } as never, 4, { hours: 1 }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects a caller whose account was deleted', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...motherUser, deletedAt: new Date() });

    await expect(
      requestBookingExtension({ uid: 'firebase-mother' } as never, 4, { hours: 1 }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('404s on a booking that does not exist', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(null);

    await expect(
      requestBookingExtension({ uid: 'firebase-mother' } as never, 4, { hours: 1 }),
    ).rejects.toMatchObject({ statusCode: 404, message: 'Booking not found.' });
  });

  it('refuses a mother extending someone else’s booking', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({ ...makeBooking(), motherId: 999 });

    await expect(
      requestBookingExtension({ uid: 'firebase-mother' } as never, 4, { hours: 1 }),
    ).rejects.toMatchObject({ statusCode: 403, message: 'Access denied.' });
  });

  it('names the booking status when it is not under way', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      makeBooking({ status: PrismaBookingStatus.COMPLETED }),
    );

    await expect(
      requestBookingExtension({ uid: 'firebase-mother' } as never, 4, { hours: 1 }),
    ).rejects.toThrow('This one is COMPLETED.');
  });

  it('refuses a running booking that has no nanny to ask', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({ ...makeBooking(), nannyProfileId: null });

    await expect(
      requestBookingExtension({ uid: 'firebase-mother' } as never, 4, { hours: 1 }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'This booking has no assigned nanny to ask.',
    });
  });

  it('quotes the maximum-duration limit, with the length the booking would reach', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(makeBooking({ durationHours: 10.5 }));

    await expect(
      requestBookingExtension({ uid: 'firebase-mother' } as never, 4, { hours: 2 }),
    ).rejects.toThrow('A booking can run for at most 12 hours, and this one would reach 12.5.');
  });

  it('blames the daily window when the duration is fine but the shift would end too late', async () => {
    // Ends 20:00–21:00 platform time (DST-dependent); +3h lands past the 22:00 close.
    mockPrisma.booking.findUnique.mockResolvedValue(makeBooking({ endHour: 18, durationHours: 3 }));

    await expect(
      requestBookingExtension({ uid: 'firebase-mother' } as never, 4, { hours: 3 }),
    ).rejects.toThrow('Those extra hours would run past the end of the booking window for the day.');
  });

  it('refuses hours that would run into the nanny’s next booking', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({
      id: 9,
      motherId: 55,
      status: PrismaBookingStatus.CONFIRMED,
      startTime: new Date(),
      endTime: new Date(),
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      requestBookingExtension({ uid: 'firebase-mother' } as never, 4, { hours: 1 }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.bookingExtension.create).not.toHaveBeenCalled();
    // The booking's own row must never be read as the conflict.
    expect(mockPrisma.booking.findFirst.mock.calls[0][0].where.id).toEqual({ not: 4 });
    warn.mockRestore();
  });

  it('expires a stale request first, so a timed-out attempt does not block a new one', async () => {
    const stale = makeExtension({ expiresAt: new Date(Date.now() - 60_000) });
    mockPrisma.bookingExtension.findFirst
      .mockResolvedValueOnce(stale) // findOpenExtension
      .mockResolvedValueOnce(stale) // expireIfPastDeadline
      .mockResolvedValueOnce(stale) // settleExtensionUnpaid (in the transaction)
      .mockResolvedValueOnce(null); // findOpenExtension again — now settled

    await requestBookingExtension({ uid: 'firebase-mother' } as never, 4, { hours: 1 });

    expect(updatesWith('EXPIRED')).toHaveLength(1);
    expect(mockPrisma.bookingExtension.create).toHaveBeenCalledTimes(1);
  });

  it('still refuses when the in-flight request has not reached its deadline', async () => {
    const live = makeExtension({ expiresAt: new Date(Date.now() + 60_000) });
    mockPrisma.bookingExtension.findFirst.mockResolvedValue(live);

    await expect(
      requestBookingExtension({ uid: 'firebase-mother' } as never, 4, { hours: 1 }),
    ).rejects.toThrow('You already have an extension request in progress for this booking.');
    expect(updatesWith('EXPIRED')).toHaveLength(0);
  });

  it('falls back to the base rate when the booking has no effective rate frozen', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({ ...makeBooking(), effectiveHourlyRate: 0 });

    await requestBookingExtension({ uid: 'firebase-mother' } as never, 4, { hours: 2 });

    const { data } = mockPrisma.bookingExtension.create.mock.calls[0][0];
    expect(data.hourlyRate).toBe(100);
    expect(data.subtotal).toBe(200);
  });

  it('splits the quote by the revenue split and rounds every figure to 2dp', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      ...makeBooking(),
      effectiveHourlyRate: 33.333,
    });

    await requestBookingExtension({ uid: 'firebase-mother' } as never, 4, { hours: 3 });

    const { data } = mockPrisma.bookingExtension.create.mock.calls[0][0];
    expect(data.subtotal).toBe(100); // 99.999 → 100.00
    expect(data.totalAmount).toBe(100);
    expect(data.nannyAmount).toBe(80); // default 80% nanny share
    expect(data.platformAmount).toBe(20);
    expect(data.nannyAmount + data.platformAmount).toBe(data.subtotal);
  });

  it('keeps cents exact when the split does not divide evenly', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      ...makeBooking(),
      effectiveHourlyRate: 33.33,
    });

    await requestBookingExtension({ uid: 'firebase-mother' } as never, 4, { hours: 3 });

    const { data } = mockPrisma.bookingExtension.create.mock.calls[0][0];
    expect(data.subtotal).toBe(99.99);
    expect(data.nannyAmount).toBe(79.99); // 79.992
    expect(data.platformAmount).toBe(20); // 99.99 − 79.99, not 20.000000000000007
  });

  it('gives the nanny the configured response window to answer', async () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);

    await requestBookingExtension({ uid: 'firebase-mother' } as never, 4, { hours: 1 });

    const { data } = mockPrisma.bookingExtension.create.mock.calls[0][0];
    expect(data.expiresAt.getTime()).toBe(now + BOOKING_EXTENSION_NANNY_RESPONSE_MINUTES * 60_000);
    clock.mockRestore();
  });

  it('moves the end time out by exactly the requested hours', async () => {
    const booking = makeBooking();
    mockPrisma.booking.findUnique.mockResolvedValue(booking);

    await requestBookingExtension({ uid: 'firebase-mother' } as never, 4, { hours: 2 });

    const { data } = mockPrisma.bookingExtension.create.mock.calls[0][0];
    expect(data.newEndTime.getTime() - booking.endTime.getTime()).toBe(2 * 3_600_000);
  });

  it('words a single extra hour in the singular', async () => {
    await requestBookingExtension({ uid: 'firebase-mother' } as never, 4, { hours: 1 });

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Jane Mom would like to extend your shift by 1 hour.' }),
    );
  });

  it('skips the nanny notification when the nanny profile cannot be read', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({ ...makeBooking(), nannyProfile: null });

    await requestBookingExtension({ uid: 'firebase-mother' } as never, 4, { hours: 1 });

    expect(mockPrisma.bookingExtension.create).toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('respondToBookingExtension — acceptance gates and package hours', () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue(nannyUser);
    mockPrisma.booking.findUnique.mockResolvedValue(makeFullBooking());
  });

  it('gives the mother the configured payment window once accepted', async () => {
    trackExtension(makeExtension());
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);

    await respondToBookingExtension({ uid: 'firebase-nanny' } as never, 77, true);

    const [accepted] = updatesWith('ACCEPTED');
    expect(accepted![0].data.expiresAt.getTime()).toBe(
      now + BOOKING_EXTENSION_PAYMENT_MINUTES * 60_000,
    );
    clock.mockRestore();
  });

  it('settles a request the nanny answered too late as EXPIRED and refuses the answer', async () => {
    trackExtension(makeExtension({ expiresAt: new Date(Date.now() - 1_000) }));

    await expect(
      respondToBookingExtension({ uid: 'firebase-nanny' } as never, 77, true),
    ).rejects.toThrow('This extension request is already expired.');
    expect(updatesWith('EXPIRED')).toHaveLength(1);
    expect(updatesWith('ACCEPTED')).toHaveLength(0);
  });

  it('404s on an extension that does not exist', async () => {
    mockPrisma.bookingExtension.findFirst.mockResolvedValue(null);

    await expect(
      respondToBookingExtension({ uid: 'firebase-nanny' } as never, 77, true),
    ).rejects.toMatchObject({ statusCode: 404, message: 'Extension request not found.' });
  });

  it('re-checks the duration limit at acceptance, in case the platform config moved', async () => {
    trackExtension(makeExtension());
    mockPrisma.appSettings.findMany.mockResolvedValue([
      { key: 'max_booking_hours', value: '5' },
    ]);

    await expect(
      respondToBookingExtension({ uid: 'firebase-nanny' } as never, 77, true),
    ).rejects.toThrow('A booking can run for at most 5 hours, and this one would reach 6.');
    expect(updatesWith('ACCEPTED')).toHaveLength(0);
  });

  it('refuses to accept when the nanny took another booking in the meantime', async () => {
    trackExtension(makeExtension());
    mockPrisma.booking.findFirst.mockResolvedValue({
      id: 9,
      motherId: 55,
      status: PrismaBookingStatus.CONFIRMED,
      startTime: new Date(),
      endTime: new Date(),
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      respondToBookingExtension({ uid: 'firebase-nanny' } as never, 77, true),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(updatesWith('ACCEPTED')).toHaveLength(0);
    warn.mockRestore();
  });

  it('skips the calendar check when the booking carries no nanny profile id', async () => {
    trackExtension(makeExtension());
    mockPrisma.booking.findUnique.mockResolvedValue(makeFullBooking({ nannyProfileId: null }));

    await respondToBookingExtension({ uid: 'firebase-nanny' } as never, 77, true);

    expect(mockPrisma.booking.findFirst).not.toHaveBeenCalled();
    expect(updatesWith('ACCEPTED')).toHaveLength(1);
  });

  it('reserves no package hours when the mother has none', async () => {
    const row = trackExtension(makeExtension());

    await respondToBookingExtension({ uid: 'firebase-nanny' } as never, 77, true);

    expect(mockRedeemHours).not.toHaveBeenCalled();
    expect(row().totalAmount).toBe(240);
  });

  it('takes package hours off the price, priced at the allowance of the buckets drawn', async () => {
    // Plan sees a 1-skill allowance (EGP 120/h), but FIFO drained a 0-skill
    // bucket — so each hour is only worth the base rate (EGP 100).
    const row = trackExtension(makeExtension());
    mockPrisma.booking.findUnique.mockResolvedValue(
      makeFullBooking({ selectedSkillFees: [{ id: 1, name: 'Swim', amountPerHour: 20 }] }),
    );
    mockRedeemableSummary.mockResolvedValue({ availableHours: 5, maxSkillsAllowed: 1 });
    mockRedeemHours.mockResolvedValue({ hoursApplied: 2, maxSkillsAllowed: 0 });

    await respondToBookingExtension({ uid: 'firebase-nanny' } as never, 77, true);

    expect(mockRedeemHours).toHaveBeenCalledWith(expect.anything(), {
      userId: motherUser.id,
      scope: { bookingExtensionId: 77 },
      hoursNeeded: 2,
    });
    expect(row()).toMatchObject({
      packageHoursApplied: 2,
      packageSkillsCovered: 0,
      packageCreditAmount: 200,
      discountAmount: 200,
      totalAmount: 40,
      // The platform funds the credit — the nanny's share is untouched.
      platformAmount: -128,
      nannyAmount: 168,
      status: 'ACCEPTED',
    });
    expect(mockPush).toHaveBeenCalledWith(
      motherUser.id,
      expect.objectContaining({ body: expect.stringContaining('Pay EGP 40 to confirm.') }),
    );
  });

  it('only redeems the hours the owed amount can afford', async () => {
    trackExtension(makeExtension({ totalAmount: 150, subtotal: 150 }));
    mockRedeemableSummary.mockResolvedValue({ availableHours: 10, maxSkillsAllowed: 0 });
    mockRedeemHours.mockResolvedValue({ hoursApplied: 1.5, maxSkillsAllowed: 0 });

    await respondToBookingExtension({ uid: 'firebase-nanny' } as never, 77, true);

    // EGP 150 owed ÷ EGP 100 an hour = 1.5h, not the 2h extended nor the 10h held.
    expect(mockRedeemHours.mock.calls[0][1].hoursNeeded).toBe(1.5);
  });

  it('changes nothing when the reservation could not draw any hours', async () => {
    const row = trackExtension(makeExtension());
    mockRedeemableSummary.mockResolvedValue({ availableHours: 5, maxSkillsAllowed: 0 });
    mockRedeemHours.mockResolvedValue({ hoursApplied: 0, maxSkillsAllowed: 0 });

    await respondToBookingExtension({ uid: 'firebase-nanny' } as never, 77, true);

    expect(row()).toMatchObject({ totalAmount: 240, packageHoursApplied: 0, discountAmount: 0 });
  });

  it('skips the reservation if the row vanished inside the transaction', async () => {
    const pending = makeExtension();
    mockPrisma.bookingExtension.findFirst
      .mockResolvedValueOnce(pending) // expireIfPastDeadline
      .mockResolvedValueOnce(pending) // loadExtension
      .mockResolvedValueOnce(null) // applyPackageHoursToExtension
      .mockResolvedValue(makeExtension({ status: 'ACCEPTED' }));
    mockPrisma.bookingExtension.update.mockResolvedValue(makeExtension({ status: 'ACCEPTED' }));

    await respondToBookingExtension({ uid: 'firebase-nanny' } as never, 77, true);

    expect(mockRedeemableSummary).not.toHaveBeenCalled();
  });

  it('settles straight away when package hours cover the whole extension — no EGP 0 checkout', async () => {
    const row = trackExtension(makeExtension());
    mockPrisma.booking.findUnique.mockResolvedValue(
      makeFullBooking({ selectedSkillFees: [{ id: 1, name: 'Swim', amountPerHour: 20 }] }),
    );
    mockRedeemableSummary.mockResolvedValue({ availableHours: 5, maxSkillsAllowed: 1 });
    mockRedeemHours.mockResolvedValue({ hoursApplied: 2, maxSkillsAllowed: 1 });

    const res = await respondToBookingExtension({ uid: 'firebase-nanny' } as never, 77, true);

    expect(row()).toMatchObject({
      status: 'PAID',
      totalAmount: 0,
      packageCreditAmount: 240,
      packageSkillsCovered: 1,
    });
    expect(res.status).toBe('PAID');
    // The booking itself now carries the hours and the package credit.
    const { data } = mockPrisma.booking.update.mock.calls[0][0];
    expect(data).toMatchObject({
      durationHours: 6,
      totalAmount: 480,
      packageHoursApplied: 2,
      packageCreditAmount: 240,
    });
    // No "pay EGP 0" prompt — the mother is told the shift was extended instead.
    expect(mockNotify).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'BOOKING_EXTENSION_ACCEPTED' }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: motherUser.id, type: 'BOOKING_EXTENDED' }),
    );
  });

  it('stamps the nanny’s response time on a decline', async () => {
    trackExtension(makeExtension());

    await respondToBookingExtension({ uid: 'firebase-nanny' } as never, 77, false);

    const stamped = mockPrisma.bookingExtension.update.mock.calls.find(
      (c: [{ data: Record<string, unknown> }]) => c[0].data.nannyRespondedAt instanceof Date,
    );
    expect(stamped).toBeDefined();
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining('extra 2 hours') }),
    );
  });

  it('words a single declined hour in the singular', async () => {
    trackExtension(makeExtension({ hours: 1 }));

    await respondToBookingExtension({ uid: 'firebase-nanny' } as never, 77, false);

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining('the extra 1 hour this time') }),
    );
  });

  it('confirms a single accepted hour in the singular', async () => {
    trackExtension(makeExtension({ hours: 1, subtotal: 120, totalAmount: 120 }));
    mockPrisma.booking.findUnique.mockResolvedValue(makeFullBooking());

    await respondToBookingExtension({ uid: 'firebase-nanny' } as never, 77, true);

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Elena can stay 1 more hour. Pay EGP 120 to confirm.' }),
    );
  });

  it('declining returns any Care Points the request held and tells her', async () => {
    trackExtension(makeExtension({ rewardCreditPoints: 150 }));

    await respondToBookingExtension({ uid: 'firebase-nanny' } as never, 77, false);

    expect(mockRefundRedemption).toHaveBeenCalledWith(expect.anything(), {
      userId: motherUser.id,
      scope: { bookingExtensionId: 77 },
      points: 150,
    });
    expect(mockNotifyRefunded).toHaveBeenCalledWith(motherUser.id, 150);
  });
});

describe('redeemExtensionPoints', () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue(motherUser);
    mockPrisma.booking.findUnique.mockResolvedValue(makeFullBooking());
  });

  it('rejects a nanny', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(nannyUser);

    await expect(
      redeemExtensionPoints({ uid: 'firebase-nanny' } as never, 77, { hours: 1 }),
    ).rejects.toMatchObject({ statusCode: 403, message: 'Only mothers can redeem points.' });
  });

  it('rejects a mother who does not own the extension', async () => {
    trackExtension(makeExtension({ status: 'ACCEPTED', motherId: 999 }));

    await expect(
      redeemExtensionPoints({ uid: 'firebase-mother' } as never, 77, { hours: 1 }),
    ).rejects.toMatchObject({ statusCode: 403, message: 'Access denied.' });
  });

  it('refuses an extension the nanny has not accepted yet', async () => {
    trackExtension(makeExtension({ status: 'PENDING_NANNY' }));

    await expect(
      redeemExtensionPoints({ uid: 'firebase-mother' } as never, 77, { hours: 1 }),
    ).rejects.toThrow('Points can only be applied to an accepted extension before payment.');
    expect(mockApplyRedemption).not.toHaveBeenCalled();
  });

  it('refuses once the payment window has lapsed, settling the extension as EXPIRED', async () => {
    trackExtension(
      makeExtension({ status: 'ACCEPTED', expiresAt: new Date(Date.now() - 1_000) }),
    );

    await expect(
      redeemExtensionPoints({ uid: 'firebase-mother' } as never, 77, { hours: 1 }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(updatesWith('EXPIRED')).toHaveLength(1);
    expect(mockApplyRedemption).not.toHaveBeenCalled();
  });

  it('refuses to apply points twice', async () => {
    trackExtension(makeExtension({ status: 'ACCEPTED', rewardCreditAmount: 120 }));

    await expect(
      redeemExtensionPoints({ uid: 'firebase-mother' } as never, 77, { hours: 1 }),
    ).rejects.toThrow('Points are already applied to this extension.');
  });

  it('takes the discount off the total and the platform share, never the nanny’s', async () => {
    const row = trackExtension(makeExtension({ status: 'ACCEPTED' }));
    mockApplyRedemption.mockResolvedValue({ hours: 1, pointsCost: 100, discount: 120 });

    const res = await redeemExtensionPoints({ uid: 'firebase-mother' } as never, 77, { hours: 1 });

    expect(mockApplyRedemption).toHaveBeenCalledWith(expect.anything(), {
      userId: motherUser.id,
      scope: { bookingExtensionId: 77 },
      redeemHours: 1,
      perHour: 120,
      durationHours: 2,
      owedAmount: 240,
    });
    expect(row()).toMatchObject({
      discountAmount: 120,
      totalAmount: 120,
      platformAmount: -48,
      nannyAmount: 168,
      rewardCreditHoursApplied: 1,
      rewardCreditPoints: 100,
      rewardCreditAmount: 120,
      status: 'ACCEPTED',
    });
    expect(res.totalAmount).toBe(120);
    expect(mockNotifyRedeemed).toHaveBeenCalledWith(motherUser.id, 100, 1);
  });

  it('owes only what the package left: points stack on an earlier package credit', async () => {
    const row = trackExtension(
      makeExtension({ status: 'ACCEPTED', discountAmount: 200, totalAmount: 40, platformAmount: -128 }),
    );
    mockApplyRedemption.mockResolvedValue({ hours: 1, pointsCost: 100, discount: 40 });

    await redeemExtensionPoints({ uid: 'firebase-mother' } as never, 77, { hours: 1 });

    expect(mockApplyRedemption.mock.calls[0][1].owedAmount).toBe(40);
    expect(row()).toMatchObject({ discountAmount: 240, platformAmount: -168 });
  });

  it('never discounts below zero owed, even if the redemption is worth more', async () => {
    trackExtension(makeExtension({ status: 'ACCEPTED', totalAmount: 100.5, subtotal: 240 }));
    mockApplyRedemption.mockResolvedValue({ hours: 1, pointsCost: 100, discount: 120 });

    const res = await redeemExtensionPoints({ uid: 'firebase-mother' } as never, 77, { hours: 1 });

    // Fully covered → settled, with exactly what was owed taken off.
    expect(res.status).toBe('PAID');
    expect(res.rewardCreditAmount).toBe(100.5);
    expect(res.totalAmount).toBe(0);
    expect(mockPrisma.booking.update).toHaveBeenCalledTimes(1);
  });

  it('rounds the discounted figures to 2dp', async () => {
    const row = trackExtension(makeExtension({ status: 'ACCEPTED', totalAmount: 100.5 }));
    mockApplyRedemption.mockResolvedValue({ hours: 1, pointsCost: 100, discount: 33.333 });

    await redeemExtensionPoints({ uid: 'firebase-mother' } as never, 77, { hours: 1 });

    expect(row()).toMatchObject({ discountAmount: 33.33, totalAmount: 67.17 });
  });
});

describe('applyPaidExtension — missing rows and notifications', () => {
  it('does nothing when the extension does not exist', async () => {
    mockPrisma.bookingExtension.findFirst.mockResolvedValue(null);

    await applyPaidExtension(77);

    expect(mockPrisma.booking.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it('does nothing when the booking is gone', async () => {
    mockPrisma.bookingExtension.findFirst.mockResolvedValue(makeExtension({ status: 'ACCEPTED' }));
    mockPrisma.booking.findUnique.mockResolvedValue(null);

    await applyPaidExtension(77);

    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    expect(mockPrisma.bookingExtension.update).not.toHaveBeenCalled();
  });

  it('folds every credit column into the booking, rounded to 2dp', async () => {
    mockPrisma.bookingExtension.findFirst.mockResolvedValue(
      makeExtension({
        status: 'ACCEPTED',
        hours: 1,
        subtotal: 33.33,
        discountAmount: 10.1,
        totalAmount: 23.23,
        nannyAmount: 26.66,
        platformAmount: -3.43,
        packageHoursApplied: 0.1,
        packageCreditAmount: 10.1,
        rewardCreditHoursApplied: 0,
        rewardCreditPoints: 7,
        rewardCreditAmount: 0,
      }),
    );
    mockPrisma.booking.findUnique.mockResolvedValue(
      makeFullBooking({
        subtotal: 0.2,
        discountAmount: 0.1,
        totalAmount: 0.1,
        nannyAmount: 0.1,
        platformAmount: 0,
        packageHoursApplied: 0.2,
        packageCreditAmount: 0.2,
        rewardCreditPoints: 3,
      }),
    );
    mockPrisma.bookingExtension.update.mockResolvedValue(makeExtension({ status: 'PAID', hours: 1 }));

    await applyPaidExtension(77);

    const { data } = mockPrisma.booking.update.mock.calls[0][0];
    expect(data).toMatchObject({
      subtotal: 33.53,
      discountAmount: 10.2,
      totalAmount: 23.33,
      nannyAmount: 26.76,
      platformAmount: -3.43,
      packageHoursApplied: 0.3, // not 0.30000000000000004
      packageCreditAmount: 10.3,
      rewardCreditPoints: 10,
    });
  });

  it('tells the mother and the nanny, each in their own words', async () => {
    mockPrisma.bookingExtension.findFirst.mockResolvedValue(makeExtension({ status: 'ACCEPTED' }));
    mockPrisma.booking.findUnique.mockResolvedValue(makeFullBooking());
    mockPrisma.bookingExtension.update.mockResolvedValue(makeExtension({ status: 'PAID', hours: 2 }));

    await applyPaidExtension(77);

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: motherUser.id,
        type: 'BOOKING_EXTENDED',
        body: 'Your booking now runs 2 hours longer.',
      }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: nannyUser.id,
        body: 'This shift has been extended by 2 hours.',
      }),
    );
    expect(mockPush).toHaveBeenCalledWith(
      nannyUser.id,
      expect.objectContaining({ data: { type: 'booking_extended', bookingId: '4', title: 'Booking extended' } }),
    );
  });

  it('words a single extra hour in the singular and skips a nanny it cannot find', async () => {
    mockPrisma.bookingExtension.findFirst.mockResolvedValue(makeExtension({ status: 'ACCEPTED' }));
    mockPrisma.booking.findUnique
      .mockResolvedValueOnce(makeFullBooking())
      .mockResolvedValueOnce(makeFullBooking({ nannyProfile: null }));
    mockPrisma.bookingExtension.update.mockResolvedValue(makeExtension({ status: 'PAID', hours: 1 }));

    await applyPaidExtension(77);

    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Your booking now runs 1 hour longer.' }),
    );
  });

  it('skips the notifications if the booking cannot be re-read afterwards', async () => {
    mockPrisma.bookingExtension.findFirst.mockResolvedValue(makeExtension({ status: 'ACCEPTED' }));
    mockPrisma.booking.findUnique
      .mockResolvedValueOnce(makeFullBooking())
      .mockResolvedValueOnce(null);
    mockPrisma.bookingExtension.update.mockResolvedValue(makeExtension({ status: 'PAID' }));

    await applyPaidExtension(77);

    expect(mockPrisma.booking.update).toHaveBeenCalledTimes(1);
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe('cancelBookingExtension — guards', () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue(motherUser);
  });

  it('rejects a nanny withdrawing the mother’s request', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(nannyUser);

    await expect(
      cancelBookingExtension({ uid: 'firebase-nanny' } as never, 77),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Only mothers can withdraw an extension request.',
    });
  });

  it('withdrawing a request that already lapsed leaves it as it was settled', async () => {
    // settleExtensionUnpaid only touches an OPEN extension; a declined one stays declined.
    trackExtension(makeExtension({ status: 'DECLINED' }));

    const res = await cancelBookingExtension({ uid: 'firebase-mother' } as never, 77);

    expect(res.status).toBe('DECLINED');
    expect(mockRefundHours).not.toHaveBeenCalled();
    expect(mockPrisma.bookingExtension.update).not.toHaveBeenCalled();
  });

  it('hands back held Care Points when the request is withdrawn', async () => {
    trackExtension(makeExtension({ status: 'ACCEPTED', rewardCreditPoints: 200, rewardCreditAmount: 120 }));

    const res = await cancelBookingExtension({ uid: 'firebase-mother' } as never, 77);

    expect(mockRefundRedemption).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ points: 200 }),
    );
    expect(res).toMatchObject({ status: 'CANCELLED', rewardCreditPoints: 0, rewardCreditAmount: 0 });
  });
});

describe('getBookingExtension', () => {
  beforeEach(() => {
    mockPrisma.booking.findUnique.mockResolvedValue(makeFullBooking());
  });

  it('lets the mother read her own extension', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(motherUser);
    trackExtension(makeExtension());

    const res = await getBookingExtension({ uid: 'firebase-mother' } as never, 77);

    expect(res).toMatchObject({ id: 77, status: 'PENDING_NANNY', totalAmount: 240 });
  });

  it('lets the assigned nanny read it', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(nannyUser);
    trackExtension(makeExtension());

    await expect(getBookingExtension({ uid: 'firebase-nanny' } as never, 77)).resolves.toMatchObject({
      id: 77,
    });
  });

  it('refuses anyone else', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...nannyUser, id: 500 });
    trackExtension(makeExtension());

    await expect(
      getBookingExtension({ uid: 'someone' } as never, 77),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses a stranger even when the booking has no nanny profile', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...nannyUser, id: 500 });
    mockPrisma.booking.findUnique.mockResolvedValue(makeFullBooking({ nannyProfile: null }));
    trackExtension(makeExtension());

    await expect(
      getBookingExtension({ uid: 'someone' } as never, 77),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('shows a request past its deadline as EXPIRED rather than live', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(motherUser);
    trackExtension(makeExtension({ status: 'ACCEPTED', expiresAt: new Date(Date.now() - 1_000) }));

    const res = await getBookingExtension({ uid: 'firebase-mother' } as never, 77);

    expect(res.status).toBe('EXPIRED');
  });

  it('never expires a PAID extension, whatever its deadline says', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(motherUser);
    trackExtension(makeExtension({ status: 'PAID', expiresAt: new Date(Date.now() - 1_000) }));

    const res = await getBookingExtension({ uid: 'firebase-mother' } as never, 77);

    expect(res.status).toBe('PAID');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('404s when the extension does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(motherUser);

    await expect(
      getBookingExtension({ uid: 'firebase-mother' } as never, 77),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('expireStaleBookingExtensions', () => {
  it('looks only for open extensions whose deadline has passed, 50 at a time', async () => {
    await expireStaleBookingExtensions();

    const { where, take } = mockPrisma.bookingExtension.findMany.mock.calls[0][0];
    expect(where.status).toEqual({ in: ['PENDING_NANNY', 'ACCEPTED'] });
    expect(where.expiresAt.lte).toBeInstanceOf(Date);
    expect(where.deletedAt).toBeNull();
    expect(take).toBe(50);
  });

  it('settles each stale extension as EXPIRED, returning what it held', async () => {
    mockPrisma.bookingExtension.findMany.mockResolvedValue([{ id: 77 }]);
    trackExtension(makeExtension({ expiresAt: new Date(Date.now() - 1_000) }));

    await expireStaleBookingExtensions();

    expect(updatesWith('EXPIRED')).toHaveLength(1);
    expect(mockRefundHours).toHaveBeenCalledWith(expect.anything(), { bookingExtensionId: 77 });
  });

  it('keeps going past one that fails, so a single bad row cannot strand the rest', async () => {
    mockPrisma.bookingExtension.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    mockPrisma.$transaction
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce(null);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(expireStaleBookingExtensions()).resolves.toBeUndefined();

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledWith(
      '[booking-extension] failed to expire a stale extension',
      expect.objectContaining({ extensionId: 1 }),
    );
    error.mockRestore();
  });
});

describe('startBookingExtensionExpiryScheduler', () => {
  const env = config as { nodeEnv: string };
  const original = env.nodeEnv;

  afterEach(() => {
    env.nodeEnv = original;
    jest.useRealTimers();
  });

  it('does not schedule anything under test', () => {
    jest.useFakeTimers();

    startBookingExtensionExpiryScheduler();

    expect(jest.getTimerCount()).toBe(0);
  });

  it('sweeps shortly after boot and then every 30 seconds', async () => {
    env.nodeEnv = 'development';
    jest.useFakeTimers();

    startBookingExtensionExpiryScheduler();
    expect(mockPrisma.bookingExtension.findMany).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(5_000);
    expect(mockPrisma.bookingExtension.findMany).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(25_000);
    expect(mockPrisma.bookingExtension.findMany).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(30_000);
    expect(mockPrisma.bookingExtension.findMany).toHaveBeenCalledTimes(3);
    jest.clearAllTimers();
  });
});

describe('BOOKING_EXTENSION_PRESET_HOURS', () => {
  it('is the shared preset list, so the app and the API offer the same amounts', () => {
    expect(BOOKING_EXTENSION_PRESET_HOURS).toBe(SHARED_PRESET_HOURS);
  });
});
