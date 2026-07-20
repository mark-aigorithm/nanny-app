import { BookingStatus as PrismaBookingStatus } from '@prisma/client';

import { nannyPhoneIfRevealable } from '@backend/services/booking.service';
import type { BookingWithRelations } from '@backend/services/booking.service';

const REVEAL_MINUTES = 45;
const MIN = 60_000;

/** Minimal booking with an assigned nanny; only the fields the gate reads matter. */
function makeBooking(overrides: {
  status?: string;
  startTime: Date;
  endTime: Date;
  phone?: string | null;
}): BookingWithRelations {
  return {
    status: overrides.status ?? PrismaBookingStatus.CONFIRMED,
    startTime: overrides.startTime,
    endTime: overrides.endTime,
    nannyProfile: {
      user: { phone: overrides.phone === undefined ? '+201000000000' : overrides.phone },
    },
  } as unknown as BookingWithRelations;
}

describe('nannyPhoneIfRevealable', () => {
  it('reveals the number once inside the window before start', () => {
    const start = new Date(Date.now() + 30 * MIN); // 30 min out (< 45) → in window
    const booking = makeBooking({ startTime: start, endTime: new Date(start.getTime() + 3 * 3_600_000) });
    expect(nannyPhoneIfRevealable(booking, REVEAL_MINUTES)).toBe('+201000000000');
  });

  it('reveals the number during the shift (IN_PROGRESS)', () => {
    const start = new Date(Date.now() - 10 * MIN);
    const booking = makeBooking({
      status: PrismaBookingStatus.IN_PROGRESS,
      startTime: start,
      endTime: new Date(start.getTime() + 3 * 3_600_000),
    });
    expect(nannyPhoneIfRevealable(booking, REVEAL_MINUTES)).toBe('+201000000000');
  });

  it('withholds the number before the window opens', () => {
    const start = new Date(Date.now() + 90 * MIN); // 90 min out (> 45) → too early
    const booking = makeBooking({ startTime: start, endTime: new Date(start.getTime() + 3 * 3_600_000) });
    expect(nannyPhoneIfRevealable(booking, REVEAL_MINUTES)).toBeNull();
  });

  it('withholds the number after the shift has ended', () => {
    const start = new Date(Date.now() - 5 * 3_600_000);
    const booking = makeBooking({ startTime: start, endTime: new Date(Date.now() - MIN) });
    expect(nannyPhoneIfRevealable(booking, REVEAL_MINUTES)).toBeNull();
  });

  it('withholds the number for a not-yet-confirmed booking, even inside the window', () => {
    const start = new Date(Date.now() + 10 * MIN);
    const booking = makeBooking({
      status: PrismaBookingStatus.APPROVED,
      startTime: start,
      endTime: new Date(start.getTime() + 3 * 3_600_000),
    });
    expect(nannyPhoneIfRevealable(booking, REVEAL_MINUTES)).toBeNull();
  });

  it('returns null when the nanny has no phone on file', () => {
    const start = new Date(Date.now() + 10 * MIN);
    const booking = makeBooking({
      startTime: start,
      endTime: new Date(start.getTime() + 3 * 3_600_000),
      phone: null,
    });
    expect(nannyPhoneIfRevealable(booking, REVEAL_MINUTES)).toBeNull();
  });

  it('honors a custom (admin-configured) reveal window', () => {
    const start = new Date(Date.now() + 90 * MIN); // outside 45 but inside 120
    const booking = makeBooking({ startTime: start, endTime: new Date(start.getTime() + 3 * 3_600_000) });
    expect(nannyPhoneIfRevealable(booking, 45)).toBeNull();
    expect(nannyPhoneIfRevealable(booking, 120)).toBe('+201000000000');
  });
});
