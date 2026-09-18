/**
 * Booking Options is a numeric form with one switch in it. What's worth
 * pinning is the part that differs from the number fields: the skill-matching
 * toggle reads back from the config, flips the live preview, and saves as a
 * real boolean — not as "false" the string, and not silently dropped.
 */
import type { AdminUser, PlatformConfig, SupportContact, SupportFaq } from '@nanny-app/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { PermissionsProvider } from '@admin/lib/permissions';
import { SettingsPage } from '@admin/pages/settings-page';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

function ok<T>(data: T) {
  return HttpResponse.json({ data, error: null });
}

const ADMIN: AdminUser = {
  id: 1,
  name: 'Ops Admin',
  email: 'ops@example.com',
  role: 'ADMIN',
  permissions: {},
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const SUPPORT: SupportContact = { whatsappNumber: '', phoneNumber: '', email: '' };

const CONFIG: PlatformConfig = {
  serviceFeePercent: 6,
  standardHourlyRate: 120,
  nannyPercent: 80,
  platformPercent: 20,
  includedChildrenPerBooking: 2,
  maxChildrenPerBooking: 4,
  extraChildFeeType: 'FLAT',
  extraChildFeeValue: 30,
  maxBookingHours: 12,
  minBookingHours: 2,
  minAdvanceBookingHours: 2,
  cancellationWindowHours: 24,
  broadcastRadiusKm: 10,
  skillMatchingEnabled: true,
  pendingWarningMinutes: 15,
  pendingCriticalMinutes: 30,
  bookingWindowStartHour: 6,
  bookingWindowEndHour: 22,
  revealPhoneMinutes: 45,
};

const FAQ: SupportFaq = {
  items: [
    { question: 'How are nannies vetted?', answer: 'Identity, references and CPR.' },
    { question: 'How do refunds work?', answer: 'Within 5–7 business days.' },
  ],
};

function backend(
  config: PlatformConfig,
  onSave: (body: unknown) => void = () => {},
  onSaveFaq: (body: SupportFaq) => void = () => {},
) {
  server.use(
    http.get('/api/admin/me', () => ok(ADMIN)),
    http.get('/api/admin/support-contact', () => ok(SUPPORT)),
    http.get('/api/admin/support-faq', () => ok(FAQ)),
    http.put('/api/admin/support-faq', async ({ request }) => {
      const body = (await request.json()) as SupportFaq;
      onSaveFaq(body);
      return ok(body);
    }),
    http.get('/api/admin/config', () => ok(config)),
    http.put('/api/admin/config', async ({ request }) => {
      const body = (await request.json()) as Partial<PlatformConfig>;
      onSave(body);
      return ok({ ...config, ...body });
    }),
  );
}

function renderPage() {
  return renderWithProviders(
    <ToastProvider>
      <PermissionsProvider>
        <SettingsPage />
      </PermissionsProvider>
    </ToastProvider>,
  );
}

const toggle = () => screen.findByRole('checkbox', { name: /match on skills/i });

describe('SettingsPage — skill matching toggle', () => {
  it('reads the saved state back from the config', async () => {
    backend({ ...CONFIG, skillMatchingEnabled: false });
    renderPage();

    expect(await toggle()).not.toBeChecked();
    expect(screen.getByText(/skills are not checked/i)).toBeInTheDocument();
  });

  it('flips the live preview before anything is saved', async () => {
    backend(CONFIG);
    renderPage();

    expect(screen.queryByText(/skills are not checked/i)).not.toBeInTheDocument();
    await userEvent.click(await toggle());

    expect(screen.getByText(/skills are not checked/i)).toBeInTheDocument();
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });

  it('saves the toggle as a boolean alongside the numeric settings', async () => {
    let saved: unknown;
    backend(CONFIG, (body) => (saved = body));
    renderPage();

    await userEvent.click(await toggle());
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(saved).toBeDefined());
    expect(saved).toMatchObject({ skillMatchingEnabled: false, broadcastRadiusKm: 10 });
    expect(await screen.findByText(/settings saved/i)).toBeInTheDocument();
  });
});

describe('SettingsPage — FAQ editor', () => {
  it('reads the saved questions back, in order', async () => {
    backend(CONFIG);
    renderPage();

    expect(await screen.findByDisplayValue('How are nannies vetted?')).toBeInTheDocument();
    expect(screen.getByDisplayValue('How do refunds work?')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Within 5–7 business days.')).toBeInTheDocument();
  });

  it('saves the whole list after a question is added', async () => {
    let saved: SupportFaq | undefined;
    backend(CONFIG, () => {}, (body) => (saved = body));
    renderPage();
    await screen.findByDisplayValue('How are nannies vetted?');

    await userEvent.click(screen.getByRole('button', { name: /add question/i }));
    await userEvent.type(screen.getByLabelText('Question 3'), 'Do you cover Alexandria?');
    await userEvent.type(
      screen.getAllByLabelText('Answer')[2] as HTMLElement,
      'Not yet — Cairo only for now.',
    );
    await userEvent.click(screen.getByRole('button', { name: /save faq/i }));

    await waitFor(() => expect(saved).toBeDefined());
    expect(saved?.items).toHaveLength(3);
    expect(saved?.items[2]).toEqual({
      question: 'Do you cover Alexandria?',
      answer: 'Not yet — Cairo only for now.',
    });
    expect(await screen.findByText(/faq saved/i)).toBeInTheDocument();
  });

  it('saves the list without a removed question', async () => {
    let saved: SupportFaq | undefined;
    backend(CONFIG, () => {}, (body) => (saved = body));
    renderPage();
    await screen.findByDisplayValue('How are nannies vetted?');

    await userEvent.click(screen.getByRole('button', { name: /remove question 1/i }));
    await userEvent.click(screen.getByRole('button', { name: /save faq/i }));

    await waitFor(() => expect(saved).toBeDefined());
    expect(saved?.items.map((i) => i.question)).toEqual(['How do refunds work?']);
  });

  it('refuses to save an entry with no answer, and says which one', async () => {
    let saved: SupportFaq | undefined;
    backend(CONFIG, () => {}, (body) => (saved = body));
    renderPage();
    await screen.findByDisplayValue('How are nannies vetted?');

    await userEvent.click(screen.getByRole('button', { name: /add question/i }));
    await userEvent.type(screen.getByLabelText('Question 3'), 'Half written');
    await userEvent.click(screen.getByRole('button', { name: /save faq/i }));

    expect(await screen.findByText(/entry 3: every entry needs an answer/i)).toBeInTheDocument();
    expect(saved).toBeUndefined();
  });
});
