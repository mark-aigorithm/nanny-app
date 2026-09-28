import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

import { canAssignBookingNanny, formatAddressArea, formatChildAge } from '@nanny-app/shared';
import type { AdminBookingDetail } from '@nanny-app/shared';

import {
  Badge,
  Button,
  CalendarClock,
  Card,
  Clock,
  Coins,
  CopyButton,
  DescriptionList,
  type DescriptionItem,
  DetailHeader,
  ErrorState,
  ICON_SIZE,
  LoadingState,
  MapPin,
  StaleRefreshBanner,
  StatCard,
  Store,
  TriangleAlert,
  useToast,
  Users,
  Wallet,
} from '@admin/components/ui';
import { AssignNannyModal } from '@admin/features/bookings/assign-nanny-modal';
import { BookingEditor } from '@admin/features/bookings/booking-editor';
import { RefundModal } from '@admin/features/bookings/refund-modal';
import { ContactLinks } from '@admin/features/users/profile-detail';
import { apiErrorMessage } from '@admin/lib/api-error';
import { fetchBooking } from '@admin/lib/api';
import {
  bookingStatusLabel,
  bookingStatusTone,
  nannyDecisionLabel,
  nannyDecisionTone,
  paymentStatusTone,
} from '@admin/lib/booking-status';
import { formatDateTime, formatEgp, formatHours, formatTimeRange } from '@admin/lib/format';
import { useCanManage } from '@admin/lib/permissions';

/** Statuses in which the booking's details are still editable (pre-service). */
const EDITABLE_STATUSES = new Set(['PENDING', 'APPROVED', 'CONFIRMED']);

const DASH = <span className="table-empty">—</span>;

/** "STANDARD" → "Standard". */
function typeLabel(type: string): string {
  const words = bookingStatusLabel(type);
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function childrenLabel(count: number): string {
  return count === 1 ? '1 child' : `${count} children`;
}

export function BookingDetailPage() {
  const canManage = useCanManage('bookings');
  const queryClient = useQueryClient();
  const toast = useToast();
  const { id = '' } = useParams();
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const { data: booking, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => fetchBooking(id),
    enabled: id !== '',
  });

  const canEdit = canManage && booking != null && EDITABLE_STATUSES.has(booking.status);
  const canAssign = canManage && booking != null && canAssignBookingNanny(booking.status);
  // An edit that lowered the price leaves the mother overpaid until someone
  // returns the difference. The editor offers that right after saving; this
  // keeps it reachable if that follow-up was cancelled or the refund failed.
  const canRefund = canManage && booking != null && booking.refundableAmount > 0;

  const actions = canEdit ? (
    editing ? (
      <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
        Cancel
      </Button>
    ) : (
      <Button size="sm" onClick={() => setEditing(true)}>
        Edit booking
      </Button>
    )
  ) : undefined;

  return (
    <section>
      <DetailHeader
        backTo="/bookings"
        backLabel="Back to bookings"
        title={booking ? `Booking #${booking.id}` : 'Booking details'}
        subtitle={booking ? `Created ${formatDateTime(booking.createdAt)}` : undefined}
        actions={actions}
      />

      {isLoading && <LoadingState label="Loading booking…" />}
      {error != null && !booking && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {booking && (
        <>
          {error != null && (
            <StaleRefreshBanner
              message={apiErrorMessage(error)}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}
          {canEdit && editing ? (
            <BookingEditor booking={booking} onDone={() => setEditing(false)} />
          ) : (
            <>
              {canRefund && (
                <div className="overpaid-banner" role="note">
                  <span>
                    The mother is overpaid by <strong>{formatEgp(booking.refundableAmount)}</strong> —
                    she paid {formatEgp(booking.amountPaid)} and the booking now totals{' '}
                    {formatEgp(booking.totalAmount)}.
                  </span>
                  <Button size="sm" onClick={() => setRefunding(true)}>
                    Refund overpayment
                  </Button>
                </div>
              )}
              <BookingSummary booking={booking} />
              <BookingStats booking={booking} />
              <BookingSections
                booking={booking}
                nannyAction={
                  canAssign ? (
                    <Button variant="ghost" size="sm" onClick={() => setAssigning(true)}>
                      {booking.nanny ? 'Change nanny' : 'Assign nanny'}
                    </Button>
                  ) : undefined
                }
              />
            </>
          )}
          {assigning && canAssign && (
            <AssignNannyModal booking={booking} onClose={() => setAssigning(false)} />
          )}
          {refunding && canRefund && (
            <RefundModal
              bookingId={booking.id}
              refundableAmount={booking.refundableAmount}
              onClose={() => setRefunding(false)}
              onRefunded={(result) => {
                queryClient.setQueryData(['booking', id], result.booking);
                void queryClient.invalidateQueries({ queryKey: ['bookings'] });
                setRefunding(false);
                toast.success(
                  'Refund issued',
                  result.method === 'PAYMOB'
                    ? `${formatEgp(result.refundedAmount ?? 0)} was refunded to the card.`
                    : `${result.grantedPoints ?? 0} Care Points were granted.`,
                );
              }}
            />
          )}
        </>
      )}
    </section>
  );
}

/**
 * The booking at a glance: where it stands, when and where it happens, and
 * for how many children. The cards below hold the detail.
 */
function BookingSummary({ booking }: { booking: AdminBookingDetail }) {
  return (
    <Card className="profile-summary">
      <span className="profile-summary-avatar profile-summary-avatar--fallback" aria-hidden>
        <CalendarClock size={34} />
      </span>
      <div className="profile-summary-body">
        <div className="profile-summary-badges">
          <Badge tone={bookingStatusTone(booking.status)}>
            {bookingStatusLabel(booking.status)}
          </Badge>
          <Badge tone={nannyDecisionTone(booking.nannyDecision)}>
            Nanny: {nannyDecisionLabel(booking.nannyDecision).toLowerCase()}
          </Badge>
          {booking.payment ? (
            <Badge tone={paymentStatusTone(booking.payment.status)}>
              Payment: {bookingStatusLabel(booking.payment.status)}
            </Badge>
          ) : (
            <Badge>Not paid</Badge>
          )}
          <Badge>{typeLabel(booking.type)}</Badge>
        </div>
        <ul className="profile-summary-contact">
          <li>
            <Clock size={ICON_SIZE.inline} aria-label="When" />
            {formatTimeRange(booking.startTime, booking.endTime)} ·{' '}
            {formatHours(booking.durationHours)} h
          </li>
          <li>
            <MapPin size={ICON_SIZE.inline} aria-label="Where" />
            {booking.address ? formatAddressArea(booking.address) || booking.address.label : DASH}
          </li>
          <li>
            <Users size={ICON_SIZE.inline} aria-label="Children" />
            {childrenLabel(booking.children.length || booking.childrenCount)}
          </li>
        </ul>
      </div>
    </Card>
  );
}

/** The money split the pricing engine produced, where an operator looks first. */
function BookingStats({ booking }: { booking: AdminBookingDetail }) {
  return (
    <div className="stat-grid stat-grid--fit">
      <StatCard
        label="Total"
        value={formatEgp(booking.totalAmount)}
        icon={<Wallet size={ICON_SIZE.stat} aria-hidden />}
        hint={booking.amountPaid > 0 ? `Paid ${formatEgp(booking.amountPaid)}` : 'Nothing paid yet'}
      />
      <StatCard
        label="Nanny earns"
        value={formatEgp(booking.nannyAmount)}
        icon={<Coins size={ICON_SIZE.stat} aria-hidden />}
        iconTone="gold"
      />
      <StatCard
        label="Platform keeps"
        value={formatEgp(booking.platformAmount)}
        icon={<Store size={ICON_SIZE.stat} aria-hidden />}
        iconTone="bronze"
      />
    </div>
  );
}

function BookingSections({
  booking,
  nannyAction,
}: {
  booking: AdminBookingDetail;
  nannyAction?: ReactNode;
}) {
  const schedule: DescriptionItem[] = [
    { label: 'Starts', value: formatDateTime(booking.startTime) },
    { label: 'Ends', value: formatDateTime(booking.endTime) },
    { label: 'Duration', value: `${formatHours(booking.durationHours)} h` },
    {
      // Only present while the PIN the parent is reading out is still good;
      // the API nulls it otherwise, so a dash covers "not started", "expired"
      // and "already used" alike.
      label: 'Start PIN',
      value: booking.startPin ? (
        <>
          <code>{booking.startPin}</code>
          {booking.startPinExpiresAt ? ` · expires ${formatDateTime(booking.startPinExpiresAt)}` : ''}
        </>
      ) : (
        DASH
      ),
    },
    {
      label: 'Children',
      wide: true,
      value:
        booking.children.length > 0 ? (
          <ul className="booking-children">
            {booking.children.map((child, index) => (
              <li key={index}>
                <span>
                  {child.name ? (
                    <>
                      <strong>{child.name}</strong> · {formatChildAge(child.ageYears)}
                    </>
                  ) : (
                    formatChildAge(child.ageYears)
                  )}
                </span>
                {/* Support needs to see the allergy the nanny was warned about. */}
                {child.allergies && (
                  <Badge tone="warning">
                    <span className="badge-with-icon">
                      <TriangleAlert size={12} aria-hidden />
                      Allergies: {child.allergies}
                    </span>
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        ) : (
          childrenLabel(booking.childrenCount)
        ),
    },
  ];

  // The address as it was when the mother booked — a snapshot, so it reads the
  // same after she edits or deletes the entry.
  const where: DescriptionItem[] = booking.address
    ? [
        { label: booking.address.label, value: booking.address.formattedAddress, wide: true },
        { label: 'Area', value: formatAddressArea(booking.address) || DASH },
        {
          label: 'Door',
          value:
            [
              booking.address.building ? `Building ${booking.address.building}` : null,
              booking.address.floor ? `Floor ${booking.address.floor}` : null,
              booking.address.apartment ? `Apt ${booking.address.apartment}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || DASH,
        },
        { label: 'Landmark', value: booking.address.landmark ?? DASH, wide: true },
        {
          label: 'Pin',
          value: (
            <code>
              {booking.address.latitude}, {booking.address.longitude}
            </code>
          ),
        },
      ]
    : [];

  return (
    <div className="detail-grid">
      <Card title="Mommy">
        <Party
          name={booking.mother.name}
          to={`/users/mothers/${booking.mother.id}`}
          email={booking.mother.email}
          phone={booking.mother.phone}
        />
      </Card>

      <Card title="Nanny" action={nannyAction}>
        {booking.nanny ? (
          <Party
            name={booking.nanny.name}
            to={`/users/nannies/${booking.nanny.id}`}
            email={booking.nanny.email}
            phone={booking.nanny.phone}
          />
        ) : (
          <p className="table-subtext">No nanny assigned yet.</p>
        )}
      </Card>

      <Card title="Schedule">
        <DescriptionList items={schedule} />
      </Card>

      <Card title="Where">
        {booking.address ? (
          <DescriptionList items={where} />
        ) : (
          <p className="table-subtext">No address on this booking.</p>
        )}
      </Card>

      <Card title="Pricing breakdown">
        <PriceReceipt booking={booking} />
      </Card>

      <Card title="Payment details">
        <PaymentDetails booking={booking} />
      </Card>

      <Card title="Timeline">
        <BookingTimeline booking={booking} />
      </Card>

      <Card title="Notes">
        <DescriptionList
          items={[
            {
              label: 'Special instructions',
              wide: true,
              value: booking.specialInstructions ? (
                <p className="detail-note">{booking.specialInstructions}</p>
              ) : (
                DASH
              ),
            },
            ...(booking.cancellationReason
              ? [{ label: 'Cancellation reason', value: booking.cancellationReason, wide: true }]
              : []),
          ]}
        />
      </Card>
    </div>
  );
}

/** One side of the booking: a link to their profile and how to reach them. */
function Party({
  name,
  to,
  email,
  phone,
}: {
  name: string;
  to: string;
  email: string | null;
  phone: string | null;
}) {
  return (
    <div className="booking-party">
      <Link className="booking-party-name" to={to}>
        {name}
      </Link>
      <ContactLinks email={email} phone={phone} />
    </div>
  );
}

type ReceiptLine = { label: ReactNode; value: string; kind?: 'sub' | 'discount' | 'total' };

/** How the hourly rate was built up and what it came to, read top to bottom. */
function PriceReceipt({ booking }: { booking: AdminBookingDetail }) {
  const lines: ReceiptLine[] = [
    { label: 'Base rate', value: `${formatEgp(booking.baseRate)} / h` },
    ...(booking.extraChildren > 0
      ? [
          {
            label: `Extra children (${booking.extraChildren})`,
            value: `+${formatEgp(booking.extraChildFeePerHour)} / h`,
          },
        ]
      : []),
    ...booking.skillAddOns.map((skill) => ({
      label: skill.name,
      value: `+${formatEgp(skill.amountPerHour)} / h`,
    })),
    { label: 'Hourly rate', value: `${formatEgp(booking.effectiveHourlyRate)} / h`, kind: 'sub' },
    {
      label: `Subtotal · ${formatHours(booking.durationHours)} h`,
      value: formatEgp(booking.subtotal),
    },
    ...(booking.durationMultiplier !== 1
      ? [{ label: 'Duration multiplier', value: `×${booking.durationMultiplier}` }]
      : []),
    ...(booking.discountAmount > 0
      ? [
          {
            label: booking.promoCode ? (
              <>
                Discount <code>{booking.promoCode}</code>
              </>
            ) : (
              'Discount'
            ),
            value: `−${formatEgp(booking.discountAmount)}`,
            kind: 'discount' as const,
          },
        ]
      : []),
    // Legacy service fee: the nanny/platform split replaced it, so current bookings are
    // always 0. Only surface the row for old bookings that actually charged one.
    ...(booking.serviceFeeAmount > 0
      ? [{ label: 'Service fee', value: formatEgp(booking.serviceFeeAmount) }]
      : []),
    // Loyalty points aren't implemented yet — this row is future-ready.
    ...(booking.pointsRedeemed != null
      ? [{ label: 'Points redeemed', value: String(booking.pointsRedeemed) }]
      : []),
    { label: 'Total', value: formatEgp(booking.totalAmount), kind: 'total' },
  ];

  return (
    <dl className="receipt">
      {lines.map((line, index) => (
        <div
          key={index}
          className={line.kind ? `receipt-row receipt-row--${line.kind}` : 'receipt-row'}
        >
          <dt>{line.label}</dt>
          <dd>{line.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PaymentDetails({ booking }: { booking: AdminBookingDetail }) {
  const payment = booking.payment;
  if (!payment) {
    return <p className="table-subtext">No payment has been made for this booking yet.</p>;
  }

  const reference = (value: string | null, label: string) =>
    value ? (
      <span className="booking-reference">
        <code>{value}</code>
        <CopyButton value={value} label={label} />
      </span>
    ) : (
      DASH
    );

  const items: DescriptionItem[] = [
    {
      label: 'Status',
      value: (
        <Badge tone={paymentStatusTone(payment.status)}>{bookingStatusLabel(payment.status)}</Badge>
      ),
    },
    { label: 'Method', value: payment.method ? bookingStatusLabel(payment.method) : DASH },
    {
      label: 'Amount',
      value:
        payment.amount != null
          ? payment.currency && payment.currency !== 'EGP'
            ? `${payment.amount.toFixed(2)} ${payment.currency}`
            : formatEgp(payment.amount)
          : DASH,
    },
    {
      label: 'Refunded',
      value:
        payment.refundedAmount > 0
          ? `${formatEgp(payment.refundedAmount)}${payment.refundedAt ? ` on ${formatDateTime(payment.refundedAt)}` : ''}`
          : DASH,
    },
    { label: 'Paymob order', value: reference(payment.paymobOrderId, 'Paymob order') },
    {
      label: 'Paymob transaction',
      value: reference(payment.paymobTransactionId, 'Paymob transaction'),
    },
    {
      label: 'Paymob intention',
      value: reference(payment.paymobIntentionId, 'Paymob intention'),
      wide: true,
    },
    ...(payment.failureReason
      ? [{ label: 'Failure reason', value: payment.failureReason, wide: true }]
      : []),
  ];

  return <DescriptionList items={items} />;
}

/**
 * What has happened to the booking so far, oldest first. Steps still to come
 * stay listed but dimmed, so a gap — no check-in on a past booking — shows.
 */
function BookingTimeline({ booking }: { booking: AdminBookingDetail }) {
  const decided = booking.nannyDecision !== 'PENDING';
  const steps: { label: string; at: string | null }[] = [
    { label: 'Requested', at: booking.createdAt },
    {
      label: decided ? `Nanny ${nannyDecisionLabel(booking.nannyDecision).toLowerCase()}` : 'Nanny response',
      at: decided ? booking.nannyDecidedAt : null,
    },
    { label: 'Approved', at: booking.adminApprovedAt },
    { label: 'Checked in', at: booking.nannyCheckedInAt },
    { label: 'Checked out', at: booking.nannyCheckedOutAt },
    ...(booking.cancelledAt ? [{ label: 'Cancelled', at: booking.cancelledAt }] : []),
  ];

  return (
    <ol className="booking-timeline">
      {steps.map((step) => (
        <li
          key={step.label}
          className={step.at ? 'booking-timeline-step' : 'booking-timeline-step booking-timeline-step--pending'}
        >
          <span className="booking-timeline-label">{step.label}</span>
          <span className="booking-timeline-time">
            {step.at ? formatDateTime(step.at) : 'Not yet'}
          </span>
        </li>
      ))}
    </ol>
  );
}
