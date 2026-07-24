import { Role, BookingStatus, NannyBookingDecision } from '@nanny-app/shared';
import { BookingStatus as PrismaBookingStatus } from '@prisma/client';

import { AppError } from '@backend/lib/errors';

jest.mock('@backend/db/prisma', () => {
  const booking = {
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  };
  const user = { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() };
  const nannyProfile = { findUnique: jest.fn(), findMany: jest.fn() };
  const payment = { create: jest.fn(), updateMany: jest.fn() };
  const skill = { findMany: jest.fn() };
  // createBooking checks the mother's prepaid package-hours balance; no packages here.
  const packagePurchase = { findMany: jest.fn().mockResolvedValue([]) };
  const durationMultiplierRule = { findMany: jest.fn() };
  return {
    prisma: {
      booking,
      user,
      nannyProfile,
      payment,
      skill,
      durationMultiplierRule,
      packagePurchase,
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)({ booking, user, nannyProfile, payment })
          : Promise.all(arg as Promise<unknown>[]),
      ),
    },
  };
});

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@backend/services/app-settings.service', () => ({
  getServiceFeePercent: jest.fn().mockResolvedValue(6),
  getStandardHourlyRate: jest.fn().mockResolvedValue(100),
  getRevenueSplit: jest.fn().mockResolvedValue({ nannyPercent: 80, platformPercent: 20 }),
  getBroadcastRadiusKm: jest.fn().mockResolvedValue(10),
  getRevealPhoneMinutes: jest.fn().mockResolvedValue(45),
  // Wide-open window: this suite is about the approval flow, not scheduling rules.
  getPlatformConfig: jest.fn().mockResolvedValue({
    serviceFeePercent: 6,
    standardHourlyRate: 100,
    nannyPercent: 80,
    platformPercent: 20,
    maxBookingHours: 12,
    minBookingHours: 1,
    minAdvanceBookingHours: 0,
    cancellationWindowHours: 24,
    broadcastRadiusKm: 10,
    pendingWarningMinutes: 15,
    pendingCriticalMinutes: 30,
    bookingWindowStartHour: 0,
    bookingWindowEndHour: 0,
  }),
}));

import { prisma } from '@backend/db/prisma';
import { createInAppNotification } from '@backend/services/notification.service';
import {
  acceptBooking,
  canTransitionBookingStatus,
  createBooking,
  declineBooking,
  mockPayBooking,
  validateStatusTransition,
} from '@backend/services/booking.service';

const mockPrisma = prisma as unknown as {
  booking: {
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    count: jest.Mock;
  };
  user: { findUnique: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
  nannyProfile: { findUnique: jest.Mock; findMany: jest.Mock };
  payment: { create: jest.Mock; updateMany: jest.Mock };
  skill: { findMany: jest.Mock };
  durationMultiplierRule: { findMany: jest.Mock };
};

const mockNotify = createInAppNotification as jest.Mock;

const motherUser = {
  id: 10,
  firebaseUid: 'fb-mother',
  role: Role.MOTHER,
  latitude: 30.0444,
  longitude: 31.2357,
  deletedAt: null,
};

const nannyUser = {
  id: 16,
  firebaseUid: 'fb-nanny',
  role: Role.NANNY,
  deletedAt: null,
};

const mother = { id: 10, firstName: 'Jane', lastName: 'Mom', avatarUrl: null };
const nannyProfileRel = {
  id: 19,
  userId: nannyUser.id,
  user: { id: nannyUser.id, firstName: 'Elena', lastName: 'Nanny', avatarUrl: null, address: null },
};

function makeBooking(overrides: Record<string, unknown> = {}) {
  const startTime = new Date('2026-08-01T10:00:00.000Z');
  const endTime = new Date('2026-08-01T13:00:00.000Z');
  return {
    id: 4,
    motherId: mother.id,
    mother,
    nannyProfileId: nannyProfileRel.id,
    nannyProfile: nannyProfileRel,
    status: PrismaBookingStatus.PENDING,
    nannyDecision: NannyBookingDecision.PENDING,
    nannyDecidedAt: null,
    adminApprovedAt: null,
    type: 'STANDARD',
    date: startTime,
    startTime,
    endTime,
    durationHours: 3,
    baseRate: 100,
    subtotal: 300,
    discountAmount: 0,
    serviceFeePercent: 6,
    serviceFeeAmount: 18,
    totalAmount: 318,
    specialInstructions: null,
    cancellationReason: null,
    cancelledAt: null,
    nannyCheckedInAt: null,
    nannyCheckedOutAt: null,
    payments: [],
    // Matches bookingInclude: the relation is always present, empty by default.
    extensions: [],
    review: null,
    createdAt: new Date('2026-07-12T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Transition table ──────────────────────────────────────────────────────────

describe('VALID_TRANSITIONS', () => {
  it('allows the pay-after-approval lifecycle', () => {
    expect(canTransitionBookingStatus(BookingStatus.PENDING, BookingStatus.APPROVED)).toBe(true);
    expect(canTransitionBookingStatus(BookingStatus.APPROVED, BookingStatus.CONFIRMED)).toBe(true);
    expect(canTransitionBookingStatus(BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS)).toBe(true);
    expect(canTransitionBookingStatus(BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED)).toBe(true);
  });

  it('allows cancelling any non-terminal status', () => {
    for (const s of [
      BookingStatus.PENDING,
      BookingStatus.APPROVED,
      BookingStatus.CONFIRMED,
      BookingStatus.IN_PROGRESS,
    ]) {
      expect(canTransitionBookingStatus(s, BookingStatus.CANCELLED)).toBe(true);
    }
  });

  it('keeps legacy PENDING_CONFIRMATION transitions', () => {
    expect(canTransitionBookingStatus(BookingStatus.PENDING_CONFIRMATION, BookingStatus.CONFIRMED)).toBe(true);
    expect(canTransitionBookingStatus(BookingStatus.PENDING_CONFIRMATION, BookingStatus.CANCELLED)).toBe(true);
  });

  it('treats COMPLETED, CANCELLED and REFUNDED as terminal', () => {
    expect(canTransitionBookingStatus(BookingStatus.COMPLETED, BookingStatus.CANCELLED)).toBe(false);
    expect(canTransitionBookingStatus(BookingStatus.CANCELLED, BookingStatus.REFUNDED)).toBe(false);
    expect(canTransitionBookingStatus(BookingStatus.REFUNDED, BookingStatus.CONFIRMED)).toBe(false);
  });

  it('rejects skipping approval (PENDING → CONFIRMED)', () => {
    expect(canTransitionBookingStatus(BookingStatus.PENDING, BookingStatus.CONFIRMED)).toBe(false);
    expect(() => validateStatusTransition(BookingStatus.PENDING, BookingStatus.CONFIRMED)).toThrow(AppError);
  });
});

// ── createBooking ───────────────────────────────────────────────────────────

describe('createBooking (broadcast)', () => {
  it('creates an unassigned PENDING request priced at the fixed rate and broadcasts to eligible nannies + admins', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(motherUser);
    // No existing pending request to reuse (idempotency lookup).
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    mockPrisma.booking.create.mockResolvedValue(
      makeBooking({ nannyProfileId: null, nannyProfile: null }),
    );
    // No add-on skills and no duration tiers configured for this scenario.
    mockPrisma.skill.findMany.mockResolvedValue([]);
    mockPrisma.durationMultiplierRule.findMany.mockResolvedValue([]);
    // Broadcast fan-out: one eligible nanny + two admins.
    mockPrisma.nannyProfile.findMany.mockResolvedValue([
      { userId: nannyUser.id, user: { latitude: null, longitude: null } },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);

    // A wall-clock window 20 days out — far enough ahead that the lead-time check
    // passes without hard-coding a date that eventually goes stale.
    const dateIso = new Date(Date.now() + 20 * 24 * 3_600_000).toISOString().slice(0, 10);

    const result = await createBooking({ uid: 'fb-mother' } as never, {
      startTime: `${dateIso}T10:00:00`,
      endTime: `${dateIso}T13:00:00`,
      skillIds: [],
    });

    expect(result.status).toBe(BookingStatus.PENDING);

    const createData = mockPrisma.booking.create.mock.calls[0][0].data;
    expect(createData.status).toBe(BookingStatus.PENDING);
    expect(createData.nannyProfileId).toBeNull();
    // Location snapshot: the mother's coordinates are copied onto the booking
    // so radius filtering stays stable if she later edits her address.
    expect(createData.latitude).toBe(30.0444);
    expect(createData.longitude).toBe(31.2357);
    // Priced from the base platform rate (100) × 3 hrs, split 80/20, no fee on top.
    expect(createData.baseRate).toBe(100);
    expect(createData.subtotal).toBe(300);
    expect(createData.totalAmount).toBe(300);
    expect(createData.nannyAmount).toBe(240);
    expect(createData.platformAmount).toBe(60);

    // Eligible nanny + both admins each get a BOOKING_REQUESTED in-app notification.
    const requested = mockNotify.mock.calls.filter((c) => c[0].type === 'BOOKING_REQUESTED');
    expect(requested).toHaveLength(3);
    expect(requested.map((c) => c[0].userId).sort()).toEqual(
      [1, 2, nannyUser.id].sort(),
    );
  });
});

// ── Claim: first nanny to accept an unassigned request auto-approves it ────────

describe('claim (unassigned request)', () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue(nannyUser);
    mockPrisma.nannyProfile.findUnique.mockResolvedValue({
      id: nannyProfileRel.id,
      userId: nannyUser.id,
      deletedAt: null,
    });
  });

  it('claims atomically: guarded updateMany assigns the nanny and moves PENDING → APPROVED, prompting the mother to pay', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      makeBooking({ nannyProfileId: null, nannyProfile: null, type: 'STANDARD' }),
    );
    // assertNoConflict finds no overlapping booking.
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.booking.findUniqueOrThrow.mockResolvedValue(
      makeBooking({ status: PrismaBookingStatus.APPROVED, nannyDecision: NannyBookingDecision.ACCEPTED }),
    );

    const result = await acceptBooking({ uid: 'fb-nanny' } as never, 4);

    expect(result.status).toBe(BookingStatus.APPROVED);

    // The conditional write is what makes first-to-accept race-safe: it only
    // matches a row that is still an unclaimed PENDING request.
    const claimCall = mockPrisma.booking.updateMany.mock.calls[0][0];
    expect(claimCall.where).toEqual(
      expect.objectContaining({
        id: 4,
        status: PrismaBookingStatus.PENDING,
        nannyProfileId: null,
        deletedAt: null,
      }),
    );
    expect(claimCall.data).toEqual(
      expect.objectContaining({
        nannyProfileId: nannyProfileRel.id,
        status: PrismaBookingStatus.APPROVED,
        nannyDecision: NannyBookingDecision.ACCEPTED,
      }),
    );

    // Mother is told a nanny accepted (reuses BOOKING_APPROVED).
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: motherUser.id, type: 'BOOKING_APPROVED' }),
    );
  });

  it('rejects the loser of a simultaneous claim race (updateMany matched no row)', async () => {
    // The pre-read still sees an unclaimed PENDING request…
    mockPrisma.booking.findUnique.mockResolvedValue(
      makeBooking({ nannyProfileId: null, nannyProfile: null }),
    );
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    // …but another nanny's claim commits first, so the guarded write misses.
    mockPrisma.booking.updateMany.mockResolvedValue({ count: 0 });

    await expect(acceptBooking({ uid: 'fb-nanny' } as never, 4)).rejects.toThrow(
      /already accepted/i,
    );
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('rejects a second nanny once the request is already claimed (double-claim guard)', async () => {
    // The transaction re-reads the booking and finds it no longer PENDING.
    mockPrisma.booking.findUnique.mockResolvedValue(
      makeBooking({ status: PrismaBookingStatus.APPROVED, nannyProfileId: 20 }),
    );

    await expect(acceptBooking({ uid: 'fb-nanny' } as never, 4)).rejects.toThrow(AppError);
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });
});

// ── Nanny decision (informational only) ───────────────────────────────────────

describe('nanny decision', () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue(nannyUser);
    mockPrisma.nannyProfile.findUnique.mockResolvedValue({
      id: nannyProfileRel.id,
      userId: nannyUser.id,
      deletedAt: null,
    });
  });

  it('acceptBooking sets nannyDecision ACCEPTED without changing status', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(makeBooking());
    mockPrisma.booking.update.mockResolvedValue(
      makeBooking({ nannyDecision: NannyBookingDecision.ACCEPTED, nannyDecidedAt: new Date() }),
    );

    const result = await acceptBooking({ uid: 'fb-nanny' } as never, 4);

    expect(result.nannyDecision).toBe(NannyBookingDecision.ACCEPTED);
    expect(result.status).toBe(BookingStatus.PENDING);
    const updateData = mockPrisma.booking.update.mock.calls[0][0].data;
    expect(updateData.nannyDecision).toBe(NannyBookingDecision.ACCEPTED);
    expect(updateData.status).toBeUndefined();
  });

  it('declineBooking sets nannyDecision DECLINED without changing status', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(makeBooking());
    mockPrisma.booking.update.mockResolvedValue(
      makeBooking({ nannyDecision: NannyBookingDecision.DECLINED, nannyDecidedAt: new Date() }),
    );

    const result = await declineBooking({ uid: 'fb-nanny' } as never, 4);

    expect(result.nannyDecision).toBe(NannyBookingDecision.DECLINED);
    expect(result.status).toBe(BookingStatus.PENDING);
    const updateData = mockPrisma.booking.update.mock.calls[0][0].data;
    expect(updateData.nannyDecision).toBe(NannyBookingDecision.DECLINED);
    expect(updateData.status).toBeUndefined();
  });

  it('rejects a decision once the booking is no longer PENDING', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      makeBooking({ status: PrismaBookingStatus.APPROVED }),
    );

    await expect(acceptBooking({ uid: 'fb-nanny' } as never, 4)).rejects.toThrow(AppError);
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });
});

// ── Payment (mock) — only from APPROVED ───────────────────────────────────────

describe('mockPayBooking', () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue(motherUser);
  });

  it('confirms an APPROVED booking on success and notifies the nanny', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      makeBooking({ status: PrismaBookingStatus.APPROVED }),
    );
    mockPrisma.payment.create.mockResolvedValue({ id: 21, status: 'CAPTURED' });
    mockPrisma.booking.update.mockResolvedValue(
      makeBooking({ status: PrismaBookingStatus.CONFIRMED }),
    );

    const result = await mockPayBooking({ uid: 'fb-mother' } as never, 4, {
      method: 'CARD',
      succeed: true,
    });

    expect(result.booking.status).toBe(BookingStatus.CONFIRMED);
    const updateData = mockPrisma.booking.update.mock.calls[0][0].data;
    expect(updateData.status).toBe(BookingStatus.CONFIRMED);
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: nannyUser.id, type: 'BOOKING_CONFIRMED' }),
    );
  });

  it('rejects payment for a booking that is not APPROVED', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      makeBooking({ status: PrismaBookingStatus.PENDING }),
    );

    await expect(
      mockPayBooking({ uid: 'fb-mother' } as never, 4, { method: 'CARD', succeed: true }),
    ).rejects.toThrow(AppError);
    expect(mockPrisma.payment.create).not.toHaveBeenCalled();
  });

  it('leaves the booking APPROVED when the payment fails', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      makeBooking({ status: PrismaBookingStatus.APPROVED }),
    );
    mockPrisma.payment.create.mockResolvedValue({ id: 21, status: 'FAILED' });
    mockPrisma.booking.update.mockResolvedValue(
      makeBooking({ status: PrismaBookingStatus.APPROVED }),
    );

    const result = await mockPayBooking({ uid: 'fb-mother' } as never, 4, {
      method: 'CARD',
      succeed: false,
    });

    expect(result.booking.status).toBe(BookingStatus.APPROVED);
    const updateData = mockPrisma.booking.update.mock.calls[0][0].data;
    expect(updateData.status).toBeUndefined();
  });
});
