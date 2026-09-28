import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { ProfileSummary } from '@admin/features/users/profile-detail';
import { renderWithProviders } from '@admin/test/render';

function renderSummary(phone: string | null = '+20 123 456-7893') {
  return renderWithProviders(
    <ToastProvider>
      <ProfileSummary
        name="Nanny Test"
        avatarUrl={null}
        email="nanny@example.com"
        phone={phone}
        isEmailVerified
        isPhoneVerified
      />
    </ToastProvider>,
  );
}

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('ProfileSummary contact details', () => {
  it('links the email to a new message and the phone to a call', () => {
    renderSummary();

    expect(screen.getByRole('link', { name: 'nanny@example.com' })).toHaveAttribute(
      'href',
      'mailto:nanny@example.com',
    );
    // Dialable: the spaces and dash that make it readable are dropped.
    expect(screen.getByRole('link', { name: '+20 123 456-7893' })).toHaveAttribute(
      'href',
      'tel:+201234567893',
    );
  });

  it('copies the email and phone number as shown', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    renderSummary();

    fireEvent.click(screen.getByRole('button', { name: 'Copy email' }));
    await screen.findByText('Email copied');
    fireEvent.click(screen.getByRole('button', { name: 'Copy phone number' }));
    await screen.findByText('Phone number copied');

    expect(writeText.mock.calls).toEqual([['nanny@example.com'], ['+20 123 456-7893']]);
  });

  it('says so when the browser blocks the clipboard', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')));
    renderSummary();

    fireEvent.click(screen.getByRole('button', { name: 'Copy email' }));

    await waitFor(() => expect(screen.getByText('Couldn’t copy the email')).toBeInTheDocument());
  });

  it('offers no call or copy without a phone number', () => {
    renderSummary(null);

    expect(screen.queryByRole('button', { name: 'Copy phone number' })).toBeNull();
    expect(screen.queryByRole('link', { name: /^\+/ })).toBeNull();
  });
});
