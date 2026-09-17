/**
 * Booking Options is a numeric form with one switch in it. What's worth
 * pinning is the part that differs from the number fields: the skill-matching
 * toggle reads back from the config, flips the live preview, and saves as a
 * real boolean — not as "false" the string, and not silently dropped.
 */
import type { AdminUser, PlatformConfig, SupportContact } from '@nanny-app/shared';
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

function backend(config: PlatformConfig, onSave: (body: unknown) => void = () => {}) {
  server.use(
    http.get('/api/admin/me', () => ok(ADMIN)),
    http.get('/api/admin/support-contact', () => ok(SUPPORT)),
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
