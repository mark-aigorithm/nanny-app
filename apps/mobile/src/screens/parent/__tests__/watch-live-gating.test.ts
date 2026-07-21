import type { BookingResponse } from '@nanny-app/shared';

/**
 * The "Watch live" button is gated on exactly two things, and getting either
 * wrong is user-visible: showing it without a camera dead-ends the parent, and
 * showing it outside the shift exposes a feed that the backend will refuse.
 *
 * This mirrors the expression in BookingDetailScreen. Kept as a pure predicate
 * so the rule is testable without mounting the screen.
 */
function canWatchLive(booking: Pick<BookingResponse, 'status' | 'hasCamera'>): boolean {
  return booking.status === 'IN_PROGRESS' && booking.hasCamera;
}

describe('canWatchLive', () => {
  it('shows the button during the shift when a camera exists', () => {
    expect(canWatchLive({ status: 'IN_PROGRESS', hasCamera: true })).toBe(true);
  });

  it('hides the button when the nanny has no camera', () => {
    expect(canWatchLive({ status: 'IN_PROGRESS', hasCamera: false })).toBe(false);
  });

  it.each(['PENDING', 'APPROVED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'REFUNDED'] as const)(
    'hides the button while the booking is %s, even with a camera',
    (status) => {
      expect(canWatchLive({ status, hasCamera: true })).toBe(false);
    },
  );
});
