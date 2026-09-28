import {
  bookingDayLabel,
  childrenPhrase,
  durationLabel,
  elapsedLabel,
  formatSpan,
  nannyInitials,
  shiftProgress,
  timeLeftLabel,
} from '@mobile/lib/bookingDetail';

const MIN = 60_000;
const START = '2026-09-28T09:00:00+03:00';
const END = '2026-09-28T13:00:00+03:00';
const at = (iso: string, plusMin = 0) => new Date(iso).getTime() + plusMin * MIN;

describe('shiftProgress', () => {
  it('places now, the time left and the care-log moments on the booked window', () => {
    const p = shiftProgress({
      startTime: START,
      endTime: END,
      checkedInAt: new Date(at(START, -5)).toISOString(),
      moments: [new Date(at(START, 120)).toISOString(), new Date(at(START, 15)).toISOString()],
      now: at(START, 60),
    });

    expect(p.fraction).toBeCloseTo(0.25);
    expect(p.msLeft).toBe(180 * MIN);
    // Elapsed runs from her check-in, which can be a little before the booked start.
    expect(p.msElapsed).toBe(65 * MIN);
    expect(p.ticks).toEqual([0.0625, 0.5]);
  });

  it('clamps to the ends of the strip before the start and after the end', () => {
    const before = shiftProgress({
      startTime: START,
      endTime: END,
      checkedInAt: null,
      moments: [new Date(at(START, -10)).toISOString()],
      now: at(START, -10),
    });
    expect(before.fraction).toBe(0);
    expect(before.ticks).toEqual([0]);
    expect(before.msElapsed).toBe(0);

    const after = shiftProgress({
      startTime: START,
      endTime: END,
      checkedInAt: null,
      moments: [],
      now: at(END, 20),
    });
    expect(after.fraction).toBe(1);
    expect(after.msLeft).toBe(-20 * MIN);
  });
});

describe('time labels', () => {
  it('says what is left, and says so plainly once the booked time is up', () => {
    expect(timeLeftLabel(175 * MIN)).toBe('2h 55m left');
    expect(timeLeftLabel(45 * MIN + 30_000)).toBe('45m left');
    expect(timeLeftLabel(30_000)).toBe('Ending now');
    expect(timeLeftLabel(-MIN)).toBe('Past the booked end time');
  });

  it('counts whole minutes since the start', () => {
    expect(elapsedLabel(20_000)).toBe('Just started');
    expect(elapsedLabel(65 * MIN)).toBe('Started 1h 5m ago');
    expect(formatSpan(120 * MIN)).toBe('2h');
  });

  it('keeps "4 hours" for whole-hour bookings and never shows "4.5 hours"', () => {
    expect(durationLabel(4)).toBe('4 hours');
    expect(durationLabel(1)).toBe('1 hour');
    expect(durationLabel(4.5)).toBe('4h 30m');
  });
});

describe('childrenPhrase', () => {
  const child = (name: string | null) => ({ name, ageYears: 3, allergies: null });

  it('names the children when every one of them has a name', () => {
    expect(childrenPhrase([child('Laila')], 1)).toBe('Laila');
    expect(childrenPhrase([child('Laila'), child('Omar')], 2)).toBe('Laila and Omar');
    expect(childrenPhrase([child('Laila'), child('Omar'), child('Sara')], 3)).toBe(
      'Laila, Omar and Sara',
    );
  });

  it('falls back to a count rather than a half-named list', () => {
    expect(childrenPhrase([child('Laila'), child(null)], 2)).toBe('2 children');
    expect(childrenPhrase([child(null)], 1)).toBe('your child');
    // Bookings made before children were modelled carry only the count.
    expect(childrenPhrase([], 3)).toBe('3 children');
  });
});

describe('bookingDayLabel', () => {
  const now = new Date(2026, 8, 28, 10, 0);

  it('says today, tomorrow or yesterday before the date', () => {
    expect(bookingDayLabel('2026-09-28', now)).toBe('Today, Monday 28 September');
    expect(bookingDayLabel('2026-09-29', now)).toBe('Tomorrow, Tuesday 29 September');
    expect(bookingDayLabel('2026-09-27', now)).toBe('Yesterday, Sunday 27 September');
  });

  it('gives just the date further out', () => {
    expect(bookingDayLabel('2026-10-05', now)).toBe('Monday 5 October');
  });
});

it('nannyInitials takes a letter from each name', () => {
  expect(nannyInitials({ firstName: 'elena', lastName: ' Hassan' })).toBe('EH');
});
