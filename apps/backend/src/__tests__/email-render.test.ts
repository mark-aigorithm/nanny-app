import type { EmailVerificationEmailVars, ReceiptEmailVars } from '@nanny-app/shared';

import { renderEmail } from '@backend/lib/email/render';

// Exercises the real in-repo HTML templates (no mocks) so template drift —
// a renamed variable, a broken {{#if}}, an unclosed tag — fails loudly here.

const baseVars: ReceiptEmailVars = {
  bookingId: 42,
  parentName: 'Sarah',
  nannyName: 'Mona Ali',
  bookingDate: '6 August 2026',
  startTime: '09:00',
  endTime: '12:00',
  durationHours: 3,
  currency: 'EGP',
  subtotal: 300,
  discountAmount: 50,
  totalAmount: 250,
  paymentReference: 'TXN-555',
  paymentDate: '6 August 2026',
};

describe('renderEmail RECEIPT', () => {
  it('builds the subject and substitutes every variable', () => {
    const { subject, html } = renderEmail('RECEIPT', baseVars);

    expect(subject).toContain('booking #42');
    expect(html).toContain('Sarah');
    expect(html).toContain('Mona Ali');
    expect(html).toContain('6 August 2026');
    expect(html).toContain('09:00');
    expect(html).toContain('12:00');
    expect(html).toContain('TXN-555');
    // Wrapped in the shared layout, so the brand chrome is present.
    expect(html).toContain('NannyApp');
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('formats money with currency, two decimals and a thousands separator', () => {
    const { html } = renderEmail('RECEIPT', { ...baseVars, subtotal: 1234.5, totalAmount: 1184.5 });

    expect(html).toContain('EGP 1,234.50');
    expect(html).toContain('EGP 1,184.50');
  });

  it('leaves no unreplaced handlebars tokens', () => {
    const { html } = renderEmail('RECEIPT', baseVars);

    expect(html).not.toMatch(/\{\{/);
  });

  it('shows the discount line only when a discount was applied', () => {
    expect(renderEmail('RECEIPT', baseVars).html).toContain('Discount');
    expect(renderEmail('RECEIPT', { ...baseVars, discountAmount: 0 }).html).not.toContain('Discount');
  });
});

const verificationVars: EmailVerificationEmailVars = {
  code: '004821',
  firstName: 'Sarah',
  expiryMinutes: 10,
};

describe('renderEmail EMAIL_VERIFICATION', () => {
  it('renders the code, the expiry and the greeting inside the shared layout', () => {
    const { subject, html } = renderEmail('EMAIL_VERIFICATION', verificationVars);

    expect(subject).toBe('Confirm your email for NannyApp');
    expect(html).toContain('004821');
    expect(html).toContain('10 minutes');
    expect(html).toContain('Hi Sarah');
    expect(html).toContain('NannyApp');
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('keeps a leading zero — "004821" is a valid code, "4821" is not', () => {
    const { html } = renderEmail('EMAIL_VERIFICATION', verificationVars);

    expect(html).toMatch(/>004821</);
  });

  it('keeps the code out of the subject, where a lock screen would show it', () => {
    const { subject } = renderEmail('EMAIL_VERIFICATION', verificationVars);

    expect(subject).not.toContain('004821');
  });

  it('drops the greeting when there is no name yet (nanny sign-up)', () => {
    const { firstName: _firstName, ...withoutName } = verificationVars;
    const { html } = renderEmail('EMAIL_VERIFICATION', withoutName);

    expect(html).not.toContain('Hi ');
    expect(html).toContain('004821');
  });

  it('leaves no unreplaced handlebars tokens', () => {
    expect(renderEmail('EMAIL_VERIFICATION', verificationVars).html).not.toMatch(/\{\{/);
  });
});
