jest.mock('@backend/db/prisma', () => ({
  prisma: { booking: { findMany: jest.fn() } },
}));

import { prisma } from '@backend/db/prisma';
import { getNannyBookedSlots } from '@backend/services/nanny.service';

const mockPrisma = prisma as unknown as { booking: { findMany: jest.Mock } };

/**
 * Booked slots are labelled in Cairo wall-clock hours and placed on the day the
 * caller asked about — which is not always the day the booking's `date` says it
 * starts, because a booking may run past midnight.
 *
 * July is +03:00, so a UTC instant of 19:00Z is 22:00 Cairo.
 */

const booking = (startIso: string, endIso: string) => ({
  startTime: new Date(startIso),
  endTime: new Date(endIso),
});

beforeEach(() => jest.clearAllMocks());

describe('getNannyBookedSlots', () => {
  it('labels slots with Cairo hours, not UTC hours', async () => {
    // 07:00Z–11:00Z is 10:00–14:00 in Cairo.
    mockPrisma.booking.findMany.mockResolvedValue([
      booking('2026-07-20T07:00:00Z', '2026-07-20T11:00:00Z'),
    ]);
    expect(await getNannyBookedSlots(19, { date: '2026-07-20' })).toEqual([
      '10:00',
      '11:00',
      '12:00',
      '13:00',
    ]);
  });

  it('marks only the pre-midnight hours on the day a late booking starts', async () => {
    // 22:00 → 01:00 Cairo, starting on the 20th.
    mockPrisma.booking.findMany.mockResolvedValue([
      booking('2026-07-20T19:00:00Z', '2026-07-20T22:00:00Z'),
    ]);
    expect(await getNannyBookedSlots(19, { date: '2026-07-20' })).toEqual(['22:00', '23:00']);
  });

  it('carries the post-midnight hours onto the following day', async () => {
    // Same booking, now queried for the 21st: only 00:00 belongs to that day.
    mockPrisma.booking.findMany.mockResolvedValue([
      booking('2026-07-20T19:00:00Z', '2026-07-20T22:00:00Z'),
    ]);
    expect(await getNannyBookedSlots(19, { date: '2026-07-21' })).toEqual(['00:00']);
  });

  it('does not leak the previous day’s ordinary booking onto today', async () => {
    // The query pulls in the day before to catch midnight-crossers; a booking
    // that ended the same day must not blank out today's slots.
    mockPrisma.booking.findMany.mockResolvedValue([
      booking('2026-07-19T07:00:00Z', '2026-07-19T11:00:00Z'),
    ]);
    expect(await getNannyBookedSlots(19, { date: '2026-07-20' })).toEqual([]);
  });

  it('queries the requested day and the one before it', async () => {
    mockPrisma.booking.findMany.mockResolvedValue([]);
    await getNannyBookedSlots(19, { date: '2026-07-20' });
    expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: { in: [new Date('2026-07-20T00:00:00Z'), new Date('2026-07-19T00:00:00Z')] },
        }),
      }),
    );
  });

  it('merges overlapping bookings without duplicating slots', async () => {
    mockPrisma.booking.findMany.mockResolvedValue([
      booking('2026-07-20T07:00:00Z', '2026-07-20T09:00:00Z'), // 10:00–12:00
      booking('2026-07-20T08:00:00Z', '2026-07-20T10:00:00Z'), // 11:00–13:00
    ]);
    expect(await getNannyBookedSlots(19, { date: '2026-07-20' })).toEqual([
      '10:00',
      '11:00',
      '12:00',
    ]);
  });

  it('returns nothing when the nanny has no bookings', async () => {
    mockPrisma.booking.findMany.mockResolvedValue([]);
    expect(await getNannyBookedSlots(19, { date: '2026-07-20' })).toEqual([]);
  });
});
