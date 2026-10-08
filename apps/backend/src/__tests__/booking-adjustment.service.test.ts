jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    booking: { findFirst: jest.fn() },
    bookingAdjustment: { findMany: jest.fn() },
  },
}));

import { prisma } from '@backend/db/prisma';
import { listBookingAdjustments } from '@backend/services/booking-adjustment.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  booking: { findFirst: jest.Mock };
  bookingAdjustment: { findMany: jest.Mock };
};

/** Prisma.Decimal stand-in — the service only ever calls `.toNumber()`. */
const dec = (n: number) => ({ toNumber: () => n });

const mother = { id: 10, firebaseUid: 'firebase-mother', deletedAt: null };
const decoded = { uid: 'firebase-mother' } as never;

function makeAdjustment(overrides: Record<string, unknown> = {}) {
  return {
    id: 55,
    bookingId: 4,
    motherId: mother.id,
    status: 'PENDING_PAYMENT',
    amountEgp: dec(300),
    reason: 'duration 3h → 4h, total EGP 300.00 → EGP 600.00',
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
    paidAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue(mother);
  mockPrisma.booking.findFirst.mockResolvedValue({ motherId: mother.id });
  mockPrisma.bookingAdjustment.findMany.mockResolvedValue([]);
});

describe('listBookingAdjustments', () => {
  it('returns the mother’s open balance-due amounts as plain numbers', async () => {
    mockPrisma.bookingAdjustment.findMany.mockResolvedValue([makeAdjustment()]);

    const rows = await listBookingAdjustments(decoded, 4);

    expect(rows).toEqual([
      {
        id: 55,
        bookingId: 4,
        status: 'PENDING_PAYMENT',
        amountEgp: 300,
        reason: 'duration 3h → 4h, total EGP 300.00 → EGP 600.00',
        createdAt: '2026-08-01T10:00:00.000Z',
        paidAt: null,
      },
    ]);
  });

  it('keeps the cents of the amount owed', async () => {
    mockPrisma.bookingAdjustment.findMany.mockResolvedValue([
      makeAdjustment({ amountEgp: dec(149.99) }),
    ]);

    const [row] = await listBookingAdjustments(decoded, 4);

    expect(row!.amountEgp).toBe(149.99);
  });

  it('renders a paid timestamp as ISO when one is set', async () => {
    mockPrisma.bookingAdjustment.findMany.mockResolvedValue([
      makeAdjustment({ paidAt: new Date('2026-08-02T08:30:00.000Z') }),
    ]);

    const [row] = await listBookingAdjustments(decoded, 4);

    expect(row!.paidAt).toBe('2026-08-02T08:30:00.000Z');
  });

  it('asks only for her own unsettled, non-deleted obligations on this booking, newest first', async () => {
    await listBookingAdjustments(decoded, 4);

    expect(mockPrisma.bookingAdjustment.findMany).toHaveBeenCalledWith({
      where: { bookingId: 4, motherId: mother.id, status: 'PENDING_PAYMENT', deletedAt: null },
      orderBy: { id: 'desc' },
    });
  });

  it('returns an empty list when nothing is owed', async () => {
    await expect(listBookingAdjustments(decoded, 4)).resolves.toEqual([]);
  });

  it('ignores a soft-deleted booking', async () => {
    await listBookingAdjustments(decoded, 4);

    expect(mockPrisma.booking.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 4, deletedAt: null } }),
    );
  });

  it('rejects a caller with no account', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(listBookingAdjustments(decoded, 4)).rejects.toMatchObject({ statusCode: 401 });
    expect(mockPrisma.bookingAdjustment.findMany).not.toHaveBeenCalled();
  });

  it('rejects a caller whose account was deleted', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...mother, deletedAt: new Date() });

    await expect(listBookingAdjustments(decoded, 4)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('404s on a booking that does not exist', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(null);

    await expect(listBookingAdjustments(decoded, 4)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Booking not found.',
    });
  });

  it('refuses to show another mother’s obligations', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({ motherId: 999 });

    await expect(listBookingAdjustments(decoded, 4)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Access denied.',
    });
    expect(mockPrisma.bookingAdjustment.findMany).not.toHaveBeenCalled();
  });
});
