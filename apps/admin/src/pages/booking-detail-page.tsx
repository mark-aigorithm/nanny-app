import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import type { AdminBookingDetail } from '@nanny-app/shared';

import {
  Badge,
  Card,
  DescriptionList,
  type DescriptionItem,
  DetailHeader,
  ErrorState,
  LoadingState,
} from '@admin/components/ui';
import { fetchBooking } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { formatDateTime } from '@admin/lib/format';

function money(n: number): string {
  return `EGP ${n.toFixed(2)}`;
}

function statusLabel(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase();
}

function statusTone(status: string): 'neutral' | 'success' | 'danger' {
  if (status === 'CONFIRMED' || status === 'COMPLETED' || status === 'APPROVED') return 'success';
  if (status === 'CANCELLED' || status === 'REFUNDED') return 'danger';
  return 'neutral';
}

const DASH = <span className="table-empty">—</span>;

export function BookingDetailPage() {
  const { id = '' } = useParams();
  const { data: booking, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => fetchBooking(id),
    enabled: id !== '',
  });

  return (
    <section>
      <DetailHeader
        backTo="/bookings"
        backLabel="Back to bookings"
        title="Booking details"
        subtitle={booking ? `${booking.mother.name} · ${statusLabel(booking.status)}` : undefined}
      />

      {isLoading && <LoadingState label="Loading booking…" />}
      {error != null && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {booking && <BookingSections booking={booking} />}
    </section>
  );
}

function BookingSections({ booking }: { booking: AdminBookingDetail }) {
  const overview: DescriptionItem[] = [
    { label: 'Status', value: <Badge tone={statusTone(booking.status)}>{statusLabel(booking.status)}</Badge> },
    { label: 'Nanny response', value: statusLabel(booking.nannyDecision) },
    { label: 'Type', value: booking.type },
    { label: 'Created', value: formatDateTime(booking.createdAt) },
    { label: 'Booking ID', value: <code>{booking.id}</code> },
  ];

  const parties: DescriptionItem[] = [
    { label: 'Mother', value: booking.mother.name },
    { label: 'Mother email', value: booking.mother.email ?? DASH },
    { label: 'Mother phone', value: booking.mother.phone ?? DASH },
    { label: 'Nanny', value: booking.nanny?.name ?? DASH },
    { label: 'Nanny email', value: booking.nanny?.email ?? DASH },
    { label: 'Nanny phone', value: booking.nanny?.phone ?? DASH },
  ];

  const schedule: DescriptionItem[] = [
    { label: 'Starts', value: formatDateTime(booking.startTime) },
    { label: 'Ends', value: formatDateTime(booking.endTime) },
    { label: 'Duration', value: `${booking.durationHours} h` },
    { label: 'Checked in', value: booking.nannyCheckedInAt ? formatDateTime(booking.nannyCheckedInAt) : DASH },
    { label: 'Checked out', value: booking.nannyCheckedOutAt ? formatDateTime(booking.nannyCheckedOutAt) : DASH },
    { label: 'Approved at', value: booking.adminApprovedAt ? formatDateTime(booking.adminApprovedAt) : DASH },
  ];

  const pricing: DescriptionItem[] = [
    { label: 'Base rate / h', value: money(booking.baseRate) },
    { label: 'Effective rate / h', value: money(booking.effectiveHourlyRate) },
    {
      label: 'Skill add-ons',
      value:
        booking.skillAddOns.length > 0
          ? booking.skillAddOns.map((s) => `${s.name} (+${s.amountPerHour}/h)`).join(', ')
          : DASH,
      wide: true,
    },
    { label: 'Subtotal', value: money(booking.subtotal) },
    { label: 'Duration multiplier', value: `×${booking.durationMultiplier}` },
    { label: 'Discount', value: booking.discountAmount > 0 ? `−${money(booking.discountAmount)}` : DASH },
    { label: 'Service fee', value: money(booking.serviceFeeAmount) },
    { label: 'Total', value: <strong>{money(booking.totalAmount)}</strong> },
    { label: 'Nanny earns', value: money(booking.nannyAmount) },
    { label: 'Platform keeps', value: money(booking.platformAmount) },
  ];

  const payment: DescriptionItem[] = booking.payment
    ? [
        { label: 'Status', value: statusLabel(booking.payment.status) },
        { label: 'Method', value: booking.payment.method ? statusLabel(booking.payment.method) : DASH },
        {
          label: 'Amount',
          value: booking.payment.amount != null ? money(booking.payment.amount) : DASH,
        },
        { label: 'Currency', value: booking.payment.currency ?? DASH },
        { label: 'Paymob order', value: booking.payment.paymobOrderId ?? DASH },
        { label: 'Paymob transaction', value: booking.payment.paymobTransactionId ?? DASH },
        { label: 'Paymob intention', value: booking.payment.paymobIntentionId ?? DASH },
        {
          label: 'Refunded',
          value:
            booking.payment.refundedAmount > 0
              ? `${money(booking.payment.refundedAmount)}${booking.payment.refundedAt ? ` on ${formatDateTime(booking.payment.refundedAt)}` : ''}`
              : DASH,
        },
        { label: 'Failure reason', value: booking.payment.failureReason ?? DASH, wide: true },
      ]
    : [];

  const rewards: DescriptionItem[] = [
    { label: 'Promo code', value: booking.promoCode ? <code>{booking.promoCode}</code> : DASH },
    { label: 'Discount applied', value: booking.discountAmount > 0 ? money(booking.discountAmount) : DASH },
    // Loyalty points aren't implemented yet — this row is future-ready.
    { label: 'Points redeemed', value: booking.pointsRedeemed ?? DASH },
  ];

  const notes: DescriptionItem[] = [
    { label: 'Special instructions', value: booking.specialInstructions ?? DASH, wide: true },
    ...(booking.cancellationReason
      ? [{ label: 'Cancellation reason', value: booking.cancellationReason, wide: true }]
      : []),
  ];

  return (
    <>
      <Card title="Overview">
        <DescriptionList items={overview} />
      </Card>
      <Card title="Parties">
        <DescriptionList items={parties} />
      </Card>
      <Card title="Schedule">
        <DescriptionList items={schedule} />
      </Card>
      <Card title="Pricing breakdown">
        <DescriptionList items={pricing} />
      </Card>
      <Card title="Payment details">
        {booking.payment ? (
          <DescriptionList items={payment} />
        ) : (
          <p className="empty-state">No payment has been made for this booking yet.</p>
        )}
      </Card>
      <Card title="Promo & rewards">
        <DescriptionList items={rewards} />
      </Card>
      <Card title="Notes">
        <DescriptionList items={notes} />
      </Card>
    </>
  );
}
