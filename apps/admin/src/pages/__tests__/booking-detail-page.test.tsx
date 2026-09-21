/**
 * The Schedule card carries the parent's live start PIN so support can read it
 * to a nanny on the phone. The API already decides "live" — this pins that the
 * page shows the code and its expiry when given one, and a dash when not.
 *
 * The page is also where an overpayment gets settled when the editor's own
 * refund follow-up was skipped: the banner and its modal must reach the refund
 * endpoint, and must not appear to a view-only operator or on a settled booking.
 */
import type { AdminBookingDetail, AdminRefundResponse, AdminUser } from '@nanny-app/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  amountPaid: 318,
  refundableAmount: 0,
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

function backend(booking: AdminBookingDetail, me: AdminUser = ADMIN) {
  server.use(
    http.get('/api/admin/me', () => ok(me)),
    http.get('/api/admin/bookings/4', () => ok(booking)),
  );
}

/** A four-hour booking the mother paid six hours for — 106 EGP to give back. */
const OVERPAID: AdminBookingDetail = {
  ...BOOKING,
  totalAmount: 212,
  amountPaid: 318,
  refundableAmount: 106,
};

/** An operator who can open bookings but not change them. */
const VIEWER: AdminUser = {
  ...ADMIN,
  id: 2,
  role: 'OPERATOR',
  permissions: { bookings: 'VIEW' },
};

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

  it('flags an overpaid booking and lets a manager refund it from the page', async () => {
    backend(OVERPAID);
    const settled: AdminRefundResponse = {
      method: 'PAYMOB',
      refundedAmount: 106,
      grantedPoints: null,
      booking: { ...OVERPAID, amountPaid: 212, refundableAmount: 0 },
    };
    const posted: unknown[] = [];
    server.use(
      http.post('/api/admin/bookings/4/refund', async ({ request }) => {
        posted.push(await request.json());
        return ok(settled);
      }),
    );
    renderPage();
    const user = userEvent.setup();

    // The banner says how much and why, not just that something is off.
    const banner = await screen.findByRole('note');
    expect(banner).toHaveTextContent('overpaid by EGP 106.00');
    expect(banner).toHaveTextContent('paid EGP 318.00');

    await user.click(screen.getByRole('button', { name: 'Refund overpayment' }));
    expect(await screen.findByText('Refund the overpayment')).toBeInTheDocument();
    // The amount is pre-filled with the full overpayment. (`Field` folds the
    // unit suffix and hint into the label text, hence the substring match.)
    expect(screen.getByLabelText(/^Amount to refund/)).toHaveValue(106);

    await user.type(screen.getByLabelText(/^Reason/), 'Shortened at her request.');
    await user.click(screen.getByRole('button', { name: 'Refund' }));

    await waitFor(() =>
      expect(posted).toEqual([
        { method: 'PAYMOB', amount: 106, reason: 'Shortened at her request.' },
      ]),
    );
    expect(await screen.findByText('Refund issued')).toBeInTheDocument();
    // Settled: the banner goes away without a refetch.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Refund overpayment' })).not.toBeInTheDocument(),
    );
  });

  it('shows no refund control when nothing is overpaid', async () => {
    backend(BOOKING);
    renderPage();

    await screen.findByText('Start PIN');

    expect(screen.queryByRole('button', { name: 'Refund overpayment' })).not.toBeInTheDocument();
  });

  it('hides the refund control from a view-only operator', async () => {
    backend(OVERPAID, VIEWER);
    renderPage();

    await screen.findByText('Start PIN');

    expect(screen.queryByRole('button', { name: 'Refund overpayment' })).not.toBeInTheDocument();
    expect(screen.queryByText(/overpaid by/)).not.toBeInTheDocument();
  });
});
