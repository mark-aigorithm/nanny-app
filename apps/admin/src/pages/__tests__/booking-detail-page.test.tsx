/**
 * The Schedule card carries the parent's live start PIN so support can read it
 * to a nanny on the phone. The API already decides "live" — this pins that the
 * page shows the code and its expiry when given one, and a dash when not.
 */
import type { AdminBookingDetail, AdminUser } from '@nanny-app/shared';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { PermissionsProvider } from '@admin/lib/permissions';
import { BookingDetailPage } from '@admin/pages/booking-detail-page';
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

const BOOKING: AdminBookingDetail = {
  id: 4,
  status: 'CONFIRMED',
  nannyDecision: 'ACCEPTED',
  type: 'STANDARD',
  date: '2026-09-21',
  startTime: '2026-09-21T14:00:00+03:00',
  endTime: '2026-09-21T17:00:00+03:00',
  durationHours: 3,
  totalAmount: 318,
  discountAmount: 0,
  promoCode: null,
  paymentStatus: 'CAPTURED',
  mother: { id: 10, name: 'Jane Mom', email: 'jane@example.com', phone: '+201000000000' },
  nanny: { id: 19, name: 'Elena Nanny', email: 'elena@example.com', phone: '+201111111111' },
  createdAt: '2026-09-12T00:00:00.000Z',
  baseRate: 100,
  effectiveHourlyRate: 100,
  skillAddOns: [],
  children: [{ name: 'Lina', ageYears: 3, allergies: null }],
  childrenCount: 1,
  extraChildren: 0,
  extraChildFeePerHour: 0,
  address: null,
  subtotal: 300,
  durationMultiplier: 1,
  serviceFeePercent: 0,
  serviceFeeAmount: 0,
  nannyAmount: 254,
  platformAmount: 64,
  rewardCreditHours: 0,
  packageHoursApplied: 0,
  payment: null,
  specialInstructions: null,
  cancellationReason: null,
  cancelledAt: null,
  adminApprovedAt: null,
  nannyDecidedAt: null,
  nannyCheckedInAt: null,
  nannyCheckedOutAt: null,
  updatedAt: '2026-09-12T00:00:00.000Z',
  pointsRedeemed: null,
  startPin: null,
  startPinExpiresAt: null,
};

function backend(booking: AdminBookingDetail) {
  server.use(
    http.get('/api/admin/me', () => ok(ADMIN)),
    http.get('/api/admin/bookings/4', () => ok(booking)),
  );
}

function renderPage() {
  return renderWithProviders(
    <ToastProvider>
      <PermissionsProvider>
        <MemoryRouter initialEntries={['/bookings/4']}>
          <Routes>
            <Route path="/bookings/:id" element={<BookingDetailPage />} />
          </Routes>
        </MemoryRouter>
      </PermissionsProvider>
    </ToastProvider>,
  );
}

/** Text of the value cell under the description-list label `label`. */
function rowValue(label: string): string {
  const item = screen.getByText(label).closest('.desc-item');
  if (!item) throw new Error(`No description row labelled "${label}"`);
  return item.querySelector('.desc-value')?.textContent ?? '';
}

describe('BookingDetailPage', () => {
  it('shows the live start PIN with its expiry', async () => {
    backend({
      ...BOOKING,
      startPin: '0042',
      startPinExpiresAt: '2026-09-21T11:12:00.000Z',
    });
    renderPage();

    await screen.findByText('Start PIN');

    const value = rowValue('Start PIN');
    expect(value).toContain('0042');
    // 11:12 UTC is 14:12 in the platform timezone (Africa/Cairo, +03:00 in September).
    expect(value).toContain('14:12');
  });

  it('shows a dash when no PIN is live', async () => {
    backend(BOOKING);
    renderPage();

    await screen.findByText('Start PIN');

    expect(rowValue('Start PIN')).toBe('—');
  });
});
