import { Role, BookingStatus, NannyBookingDecision } from '@nanny-app/shared';
import { BookingStatus as PrismaBookingStatus } from '@prisma/client';

import { AppError } from '@backend/lib/errors';

jest.mock('@backend/db/prisma', () => {
  const booking = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  };
  const user = { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() };
  const nannyProfile = { findUnique: jest.fn() };
  const payment = { create: jest.fn() };
  return {
    prisma: {
      booking,
      user,
      nannyProfile,
      payment,
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
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
  };
  user: { findUnique: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
  nannyProfile: { findUnique: jest.Mock };
  payment: { create: jest.Mock };
};

const mockNotify = createInAppNotification as jest.Mock;

const motherUser = {
  id: 'mother-1',
  firebaseUid: 'fb-mother',
  role: Role.MOTHER,
  deletedAt: null,
};

const nannyUser = {
  id: 'nanny-user-1',
  firebaseUid: 'fb-nanny',
  role: Role.NANNY,
  deletedAt: null,
};

const mother = { id: 'mother-1', firstName: 'Jane', lastName: 'Mom', avatarUrl: null };
const nannyProfileRel = {
  id: 'np-1',
  userId: nannyUser.id,
  user: { id: nannyUser.id, firstName: 'Elena', lastName: 'Nanny', avatarUrl: null, address: null },
  hourlyRate: 100,
};

function makeBooking(overrides: Record<string, unknown> = {}) {
  const startTime = new Date('2026-08-01T10:00:00.000Z');
  const endTime = new Date('2026-08-01T13:00:00.000Z');
  return {
    id: 'booking-1',
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
    payment: null,
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

describe('createBooking', () => {
  it('creates a PENDING request and notifies nanny + admins (no payment)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(motherUser);
    mockPrisma.nannyProfile.findUnique.mockResolvedValue({
      id: nannyProfileRel.id,
      isProfileComplete: true,
      hourlyRate: 100,
      deletedAt: null,
    });
    // existingPending lookup + assertNoConflict lookup both find nothing.
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    mockPrisma.booking.create.mockResolvedValue(makeBooking());
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]);

    // Future, timezone-safe request window (avoids a hard-coded date time-bomb).
    const start = new Date(Date.now() + 20 * 24 * 3_600_000);
    start.setUTCHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + 3 * 3_600_000);
    const dateIso = start.toISOString().slice(0, 10);

    const result = await createBooking({ uid: 'fb-mother' } as never, {
      nannyProfileId: nannyProfileRel.id,
      date: dateIso,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });

    expect(result.status).toBe(BookingStatus.PENDING);
    expect(result.nannyDecision).toBe(NannyBookingDecision.PENDING);

    const createData = mockPrisma.booking.create.mock.calls[0][0].data;
    expect(createData.status).toBe(BookingStatus.PENDING);

    // Nanny + both admins each get a BOOKING_REQUESTED in-app notification.
    const requested = mockNotify.mock.calls.filter((c) => c[0].type === 'BOOKING_REQUESTED');
    expect(requested).toHaveLength(3);
    expect(requested.map((c) => c[0].userId).sort()).toEqual(
      ['admin-1', 'admin-2', nannyUser.id].sort(),
    );
  });
});

// ── Nanny decision (informational only) ───────────────────────────────────────

describe('nanny decision', () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue(nannyUser);
    mockPrisma.nannyProfile.findUnique.mockResolvedValue({
      id: nannyProfileRel.id,
      userId: nannyUser.id,
      hourlyRate: 100,
      deletedAt: null,
    });
  });

  it('acceptBooking sets nannyDecision ACCEPTED without changing status', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(makeBooking());
    mockPrisma.booking.update.mockResolvedValue(
      makeBooking({ nannyDecision: NannyBookingDecision.ACCEPTED, nannyDecidedAt: new Date() }),
    );

    const result = await acceptBooking({ uid: 'fb-nanny' } as never, 'booking-1');

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

    const result = await declineBooking({ uid: 'fb-nanny' } as never, 'booking-1');

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

    await expect(acceptBooking({ uid: 'fb-nanny' } as never, 'booking-1')).rejects.toThrow(AppError);
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
    mockPrisma.payment.create.mockResolvedValue({ id: 'pay-1', status: 'CAPTURED' });
    mockPrisma.booking.update.mockResolvedValue(
      makeBooking({ status: PrismaBookingStatus.CONFIRMED }),
    );

    const result = await mockPayBooking({ uid: 'fb-mother' } as never, 'booking-1', {
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
      mockPayBooking({ uid: 'fb-mother' } as never, 'booking-1', { method: 'CARD', succeed: true }),
    ).rejects.toThrow(AppError);
    expect(mockPrisma.payment.create).not.toHaveBeenCalled();
  });

  it('leaves the booking APPROVED when the payment fails', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      makeBooking({ status: PrismaBookingStatus.APPROVED }),
    );
    mockPrisma.payment.create.mockResolvedValue({ id: 'pay-1', status: 'FAILED' });
    mockPrisma.booking.update.mockResolvedValue(
      makeBooking({ status: PrismaBookingStatus.APPROVED }),
    );

    const result = await mockPayBooking({ uid: 'fb-mother' } as never, 'booking-1', {
      method: 'CARD',
      succeed: false,
    });

    expect(result.booking.status).toBe(BookingStatus.APPROVED);
    const updateData = mockPrisma.booking.update.mock.calls[0][0].data;
    expect(updateData.status).toBeUndefined();
  });
});
