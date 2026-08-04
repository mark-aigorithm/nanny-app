import type { BookingResponse } from '@nanny-app/shared';

import {
  bookingFlowRetryParams,
  getBookingDurationHours,
  hasRequiredBookingDraft,
  parseChildrenParam,
  parseSkillIdsParam,
  payBookingParams,
  type BookingFlowParams,
} from '@mobile/lib/bookingDraft';

// This file declares NO mocks of its own. Importing `bookingDraft` transitively
// pulls `@mobile/hooks/useBookings` → `@mobile/lib/api` → `@mobile/lib/firebase`,
// which initializes the Firebase JS SDK at import time. It loads here only
// because `jest.setup.js` stubs firebase globally — that is exactly the
// boilerplate the shared setup removes.

describe('parseChildrenParam — a hand-edited deep link can never be trusted', () => {
  it('parses a well-formed param and fills in the schema defaults', () => {
    const raw = JSON.stringify([
      { ageYears: 3 },
      { name: 'Lina', ageYears: 5, allergies: 'peanuts' },
    ]);
    expect(parseChildrenParam(raw)).toEqual([
      { name: null, ageYears: 3, allergies: null },
      { name: 'Lina', ageYears: 5, allergies: 'peanuts' },
    ]);
  });

  it('rejects the WHOLE list when any child is unpriceable, degrading to none', () => {
    // ageYears 25 is past the schema ceiling (17). One bad child must not slip
    // an unpriceable age into the request — the care step re-asks instead.
    const raw = JSON.stringify([{ ageYears: 3 }, { ageYears: 25 }]);
    expect(parseChildrenParam(raw)).toEqual([]);
  });

  it('returns [] for malformed JSON rather than throwing', () => {
    expect(parseChildrenParam('{not json')).toEqual([]);
  });

  it('returns [] for a missing or empty param', () => {
    expect(parseChildrenParam(undefined)).toEqual([]);
    expect(parseChildrenParam('')).toEqual([]);
  });
});

describe('parseSkillIdsParam — tolerant of a mangled add-ons param', () => {
  it('parses a clean comma-separated list', () => {
    expect(parseSkillIdsParam('1,2,3')).toEqual([1, 2, 3]);
  });

  it('trims whitespace and drops non-positive, non-integer, and junk ids', () => {
    expect(parseSkillIdsParam(' 1 , 2 ')).toEqual([1, 2]);
    expect(parseSkillIdsParam('1,abc,0,-4,2.5,3')).toEqual([1, 3]);
  });

  it('returns [] for a missing or empty param', () => {
    expect(parseSkillIdsParam('')).toEqual([]);
    expect(parseSkillIdsParam(undefined)).toEqual([]);
  });
});

describe('hasRequiredBookingDraft — the broadcast flow needs date + window only', () => {
  const full: BookingFlowParams = {
    dateIso: '2026-08-02',
    startTimeWall: '2026-08-02T09:00:00',
    endTimeWall: '2026-08-02T13:00:00',
  };

  it('is satisfied by a date and a start/end window, with no nanny chosen', () => {
    expect(hasRequiredBookingDraft(full)).toBe(true);
  });

  it('is not satisfied when any of the three is missing', () => {
    expect(hasRequiredBookingDraft({ ...full, dateIso: undefined })).toBe(false);
    expect(hasRequiredBookingDraft({ ...full, startTimeWall: undefined })).toBe(false);
    expect(hasRequiredBookingDraft({ ...full, endTimeWall: undefined })).toBe(false);
  });
});

describe('getBookingDurationHours', () => {
  it('reads the carried duration, defaulting to 0 when absent', () => {
    expect(getBookingDurationHours({ durationHours: '4' })).toBe(4);
    expect(getBookingDurationHours({})).toBe(0);
  });
});

describe('payBookingParams — reopen checkout on an already-created booking', () => {
  const booking = {
    id: 42,
    nannyProfileId: 19,
    date: '2026-08-02',
    startTime: '2026-08-02T09:00:00+03:00',
    endTime: '2026-08-02T13:00:00+03:00',
    durationHours: 4,
    specialInstructions: 'Ring the top bell',
    nanny: { firstName: 'Amira', lastName: 'Hassan', avatarUrl: 'https://cdn/x.jpg' },
  } as unknown as BookingResponse;

  it('drops the timezone offset so the wall-clock fields stay offset-free', () => {
    const params = payBookingParams(booking);
    expect(params.startTimeWall).toBe('2026-08-02T09:00:00');
    expect(params.endTimeWall).toBe('2026-08-02T13:00:00');
  });

  it('marks it as a retry of the existing booking and assembles the nanny name', () => {
    const params = payBookingParams(booking);
    expect(params.bookingId).toBe('42');
    expect(params.retry).toBe('1');
    expect(params.nannyProfileId).toBe('19');
    expect(params.nannyName).toBe('Amira Hassan');
    expect(params.nannyPhoto).toBe('https://cdn/x.jpg');
    expect(params.instructions).toBe('Ring the top bell');
  });

  it('omits nanny fields for an unclaimed (broadcast) booking', () => {
    const unclaimed = { ...booking, nanny: undefined } as unknown as BookingResponse;
    const params = payBookingParams(unclaimed);
    expect(params.nannyName).toBeUndefined();
    expect(params.nannyPhoto).toBeUndefined();
    expect(params.bookingId).toBe('42');
  });
});

describe('bookingFlowRetryParams — carry the draft back into checkout', () => {
  it('stamps the booking id and retry flag while preserving the flow fields', () => {
    const params: BookingFlowParams = {
      nannyProfileId: '19',
      dateIso: '2026-08-02',
      startTimeWall: '2026-08-02T09:00:00',
      endTimeWall: '2026-08-02T13:00:00',
      durationHours: '4',
      promoCode: 'WELCOME10',
      pointsHours: '2',
    };
    const retry = bookingFlowRetryParams(params, 42);
    expect(retry.bookingId).toBe('42');
    expect(retry.retry).toBe('1');
    expect(retry.promoCode).toBe('WELCOME10');
    expect(retry.pointsHours).toBe('2');
    expect(retry.startTimeWall).toBe('2026-08-02T09:00:00');
  });
});
