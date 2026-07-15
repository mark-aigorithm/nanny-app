import {
  addDaysIso,
  bookingLeadTimeMessage,
  bookingWindowLengthHours,
  bookingWindowMessage,
  careDayWallClock,
  generateCareDaySlots,
  isBookingWithinDailyWindow,
} from '@nanny-app/shared';

/** Wall-clock builder — keeps the intent of each case readable. */
const at = (dateIso: string, hour: number, minute = 0): string =>
  `${dateIso}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;

const D = '2026-07-20';
const NEXT = '2026-07-21';

describe('bookingWindowLengthHours', () => {
  it('measures a same-day window', () => {
    expect(bookingWindowLengthHours(8, 22)).toBe(14);
    expect(bookingWindowLengthHours(6, 22)).toBe(16);
  });

  it('measures a window that crosses midnight', () => {
    expect(bookingWindowLengthHours(8, 2)).toBe(18);
    expect(bookingWindowLengthHours(23, 1)).toBe(2);
  });

  it('treats an end at midnight as the close of the same day', () => {
    expect(bookingWindowLengthHours(8, 0)).toBe(16);
  });

  it('treats equal bounds as a full 24 hours', () => {
    expect(bookingWindowLengthHours(8, 8)).toBe(24);
    expect(bookingWindowLengthHours(0, 0)).toBe(24);
  });
});

describe('isBookingWithinDailyWindow — same-day window (8 → 22)', () => {
  const within = (s: string, e: string) => isBookingWithinDailyWindow(s, e, 8, 22);

  it('accepts a booking fully inside', () => {
    expect(within(at(D, 10), at(D, 14))).toBe(true);
  });

  it('accepts a booking starting exactly on the window open (edge)', () => {
    expect(within(at(D, 8), at(D, 12))).toBe(true);
  });

  it('accepts a booking ending exactly on the window close (edge)', () => {
    expect(within(at(D, 18), at(D, 22))).toBe(true);
  });

  it('rejects a booking starting before the window opens', () => {
    expect(within(at(D, 7), at(D, 9))).toBe(false);
  });

  it('rejects a booking running past the window close', () => {
    expect(within(at(D, 20), at(D, 23))).toBe(false);
  });

  it('rejects a booking that crosses midnight when the window does not', () => {
    expect(within(at(D, 21), at(NEXT, 1))).toBe(false);
  });
});

describe('isBookingWithinDailyWindow — cross-midnight window (8 → 2)', () => {
  const within = (s: string, e: string) => isBookingWithinDailyWindow(s, e, 8, 2);

  it('accepts a daytime booking', () => {
    expect(within(at(D, 8), at(D, 12))).toBe(true);
  });

  it('accepts a booking ending exactly at the post-midnight close (edge)', () => {
    expect(within(at(D, 22), at(NEXT, 2))).toBe(true);
  });

  it('accepts a booking ending exactly at midnight', () => {
    expect(within(at(D, 22), at(NEXT, 0))).toBe(true);
  });

  it('accepts an after-midnight booking as part of the previous care-day', () => {
    expect(within(at(D, 1), at(D, 2))).toBe(true);
  });

  it('rejects a booking starting after the post-midnight close', () => {
    expect(within(at(D, 2), at(D, 3))).toBe(false);
  });

  it('rejects a booking starting before the window opens', () => {
    expect(within(at(D, 7), at(D, 9))).toBe(false);
  });

  it('rejects a booking running past the post-midnight close', () => {
    expect(within(at(D, 23), at(NEXT, 3))).toBe(false);
  });
});

describe('isBookingWithinDailyWindow — full-24h window', () => {
  it('accepts anything ordered when bounds are equal', () => {
    expect(isBookingWithinDailyWindow(at(D, 3), at(D, 5), 8, 8)).toBe(true);
    expect(isBookingWithinDailyWindow(at(D, 23), at(NEXT, 4), 0, 0)).toBe(true);
  });

  it('still rejects an unordered range', () => {
    expect(isBookingWithinDailyWindow(at(D, 10), at(D, 9), 0, 0)).toBe(false);
  });
});

describe('isBookingWithinDailyWindow — fails closed', () => {
  it('rejects an end at or before the start', () => {
    expect(isBookingWithinDailyWindow(at(D, 10), at(D, 10), 8, 22)).toBe(false);
    expect(isBookingWithinDailyWindow(at(D, 10), at(D, 9), 8, 22)).toBe(false);
  });

  it('rejects malformed wall-clock input', () => {
    expect(isBookingWithinDailyWindow('nonsense', at(D, 12), 8, 22)).toBe(false);
    expect(isBookingWithinDailyWindow(at(D, 10), '2026-07-20T10:00:00+03:00', 8, 22)).toBe(false);
  });

  it('rejects an impossible calendar date', () => {
    expect(isBookingWithinDailyWindow('2026-02-30T10:00:00', '2026-02-30T12:00:00', 8, 22)).toBe(
      false,
    );
  });

  it('rejects out-of-range window hours', () => {
    expect(isBookingWithinDailyWindow(at(D, 10), at(D, 12), -1, 22)).toBe(false);
    expect(isBookingWithinDailyWindow(at(D, 10), at(D, 12), 8, 24)).toBe(false);
    expect(isBookingWithinDailyWindow(at(D, 10), at(D, 12), 8.5, 22)).toBe(false);
  });
});

describe('messages', () => {
  it('describes a same-day window', () => {
    expect(bookingWindowMessage(8, 22)).toBe('Bookings must run between 8am and 10pm.');
  });

  it('describes a cross-midnight window', () => {
    expect(bookingWindowMessage(8, 2)).toBe('Bookings must run between 8am and 2am.');
  });

  it('renders midnight and noon correctly', () => {
    expect(bookingWindowMessage(0, 12)).toBe('Bookings must run between 12am and 12pm.');
  });

  it('pluralises the lead time', () => {
    expect(bookingLeadTimeMessage(1)).toBe('Bookings must be made at least 1 hour in advance.');
    expect(bookingLeadTimeMessage(2)).toBe('Bookings must be made at least 2 hours in advance.');
  });

  it('does not say "at least 0 hours" when there is no lead time', () => {
    expect(bookingLeadTimeMessage(0)).toBe('Cannot book in the past.');
  });
});

describe('addDaysIso', () => {
  it('advances across a month boundary', () => {
    expect(addDaysIso('2026-07-31', 1)).toBe('2026-08-01');
  });

  it('advances across a year boundary', () => {
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('handles a leap day', () => {
    expect(addDaysIso('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('goes backwards', () => {
    expect(addDaysIso('2026-08-01', -1)).toBe('2026-07-31');
  });

  it('is unaffected by the Cairo DST transition', () => {
    // 2026-04-24 is the spring-forward day; a day is still a day.
    expect(addDaysIso('2026-04-23', 1)).toBe('2026-04-24');
  });
});

describe('careDayWallClock', () => {
  it('keeps same-day hours on the care-day', () => {
    expect(careDayWallClock(D, 9)).toBe('2026-07-20T09:00:00');
  });

  it('rolls an hour past midnight onto the next date', () => {
    expect(careDayWallClock(D, 24)).toBe('2026-07-21T00:00:00');
    expect(careDayWallClock(D, 25)).toBe('2026-07-21T01:00:00');
  });

  it('never emits T24:00:00', () => {
    expect(careDayWallClock(D, 24)).not.toContain('T24');
  });
});

describe('generateCareDaySlots', () => {
  it('offers every start that fits the shortest booking (8 → 22, min 2)', () => {
    const slots = generateCareDaySlots(D, 8, 22, 2);
    expect(slots).toHaveLength(13); // 08:00 … 20:00 inclusive
    expect(slots[0]?.startWall).toBe('2026-07-20T08:00:00');
    expect(slots.at(-1)?.startWall).toBe('2026-07-20T20:00:00');
  });

  it('carries the next day’s date on after-midnight slots (8 → 2, min 2)', () => {
    const slots = generateCareDaySlots(D, 8, 2, 2);
    // Window is 18h; with a 2h minimum the last offerable start is 16h in = 00:00.
    expect(slots).toHaveLength(17);

    const midnight = slots.find((s) => s.absHour === 24);
    expect(midnight).toEqual({
      absHour: 24,
      hour: 0,
      dateIso: '2026-07-21',
      startWall: '2026-07-21T00:00:00',
    });
  });

  it('sorts after-midnight slots last despite their low wall-clock hour', () => {
    const slots = generateCareDaySlots(D, 8, 2, 2);
    const absHours = slots.map((s) => s.absHour);
    expect(absHours).toEqual([...absHours].sort((a, b) => a - b));
    expect(slots.at(-1)?.hour).toBe(0);
    expect(slots[0]?.hour).toBe(8);
  });

  it('shrinks the offering as the minimum booking length grows', () => {
    expect(generateCareDaySlots(D, 8, 22, 2)).toHaveLength(13);
    expect(generateCareDaySlots(D, 8, 22, 8)).toHaveLength(7);
  });

  it('offers nothing when the window cannot fit the minimum', () => {
    expect(generateCareDaySlots(D, 23, 1, 4)).toEqual([]);
  });

  it('offers a full day when the bounds are equal', () => {
    expect(generateCareDaySlots(D, 0, 0, 1)).toHaveLength(24);
  });

  it('returns nothing for out-of-range window hours', () => {
    expect(generateCareDaySlots(D, 8, 24, 2)).toEqual([]);
  });

  it('every slot start is consistent with the window check', () => {
    const slots = generateCareDaySlots(D, 8, 2, 2);
    for (const slot of slots) {
      const end = careDayWallClock(D, slot.absHour + 2);
      expect(isBookingWithinDailyWindow(slot.startWall, end, 8, 2)).toBe(true);
    }
  });
});
