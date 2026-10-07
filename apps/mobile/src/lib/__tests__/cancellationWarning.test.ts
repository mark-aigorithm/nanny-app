import { cancellationWarning } from '@mobile/lib/cancellationWarning';

describe('cancellationWarning', () => {
  it('names the window and the fee the server published', () => {
    expect(cancellationWarning({ cancellationWindowHours: 12, cancellationFeePercent: 30 })).toBe(
      'Cancellations within 12 hours of the booking are subject to a 30% fee.',
    );
  });

  it('uses the singular for a one-hour window', () => {
    expect(cancellationWarning({ cancellationWindowHours: 1, cancellationFeePercent: 50 })).toBe(
      'Cancellations within 1 hour of the booking are subject to a 50% fee.',
    );
  });

  it('says cancelling is free when the window is zero', () => {
    expect(cancellationWarning({ cancellationWindowHours: 0, cancellationFeePercent: 50 })).toBe(
      'Cancelling is free — no fee applies.',
    );
  });

  it('says cancelling is free when the fee is zero', () => {
    expect(cancellationWarning({ cancellationWindowHours: 24, cancellationFeePercent: 0 })).toBe(
      'Cancelling is free — no fee applies.',
    );
  });

  it('falls back to the platform defaults while the options are still loading', () => {
    expect(cancellationWarning(undefined)).toBe(
      'Cancellations within 24 hours of the booking are subject to a 50% fee.',
    );
  });
});
