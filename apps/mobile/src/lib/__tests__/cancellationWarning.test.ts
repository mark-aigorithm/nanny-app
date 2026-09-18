import { cancellationWarning } from '@mobile/lib/cancellationWarning';

describe('cancellationWarning', () => {
  it('names the window the server published', () => {
    expect(cancellationWarning(12)).toBe(
      'Cancellations within 12 hours of the booking are subject to a 50% fee.',
    );
  });

  it('uses the singular for a one-hour window', () => {
    expect(cancellationWarning(1)).toBe(
      'Cancellations within 1 hour of the booking are subject to a 50% fee.',
    );
  });

  it('says cancelling is free when the window is zero', () => {
    expect(cancellationWarning(0)).toBe('Cancelling is free — no fee applies.');
  });

  it('falls back to the platform default while the options are still loading', () => {
    expect(cancellationWarning(undefined)).toBe(
      'Cancellations within 24 hours of the booking are subject to a 50% fee.',
    );
  });
});
