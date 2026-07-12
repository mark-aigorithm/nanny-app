import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState, type ChangeEvent } from 'react';

import {
  BookingStatusSchema,
  SetBookingStatusSchema,
  type AdminBooking,
  type AdminBookingStatusFilter,
  type NannyBookingDecision,
} from '@nanny-app/shared';

import { Badge, Button, Card, Feedback, PageHeader } from '@admin/components/ui';
import {
  approveBooking,
  fetchBookings,
  rejectBooking,
  setBookingStatus,
  updateBookingTimes,
} from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

const TERMINAL_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'REFUNDED']);

/** ISO instant → value for a <input type="datetime-local"> (local wall time). */
function toDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_FILTERS: { value: AdminBookingStatusFilter; label: string }[] = [
  { value: 'PENDING', label: 'Pending approval' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'ALL', label: 'All' },
];

// Statuses an admin may override to. Mirrors SetBookingStatusSchema on the
// server (REFUNDED is owned by payments, never an admin-settable target).
const OVERRIDE_STATUSES = BookingStatusSchema.options.filter((s) => s !== 'REFUNDED');

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function statusLabel(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase();
}

function statusTone(status: string): 'neutral' | 'success' | 'danger' {
  if (status === 'CONFIRMED' || status === 'COMPLETED' || status === 'APPROVED') return 'success';
  if (status === 'CANCELLED' || status === 'REFUNDED') return 'danger';
  return 'neutral';
}

function nannyDecisionLabel(decision: NannyBookingDecision): string {
  if (decision === 'ACCEPTED') return 'Accepted';
  if (decision === 'DECLINED') return 'Declined';
  return 'No response';
}

export function BookingsPage() {
  const [status, setStatus] = useState<AdminBookingStatusFilter>('PENDING');
  const [editing, setEditing] = useState<{ id: string; start: string; end: string } | null>(null);
  const queryClient = useQueryClient();

  const { data: bookings, isLoading, error } = useQuery({
    queryKey: ['bookings', status],
    queryFn: () => fetchBookings(status),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['bookings'] });

  const approveMutation = useMutation({
    mutationFn: approveBooking,
    onSuccess: invalidate,
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => rejectBooking(id, reason),
    onSuccess: invalidate,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status: next }: { id: string; status: AdminBooking['status'] }) => {
      const parsed = SetBookingStatusSchema.parse({ status: next });
      return setBookingStatus(id, parsed.status);
    },
    onSuccess: invalidate,
  });

  const timesMutation = useMutation({
    mutationFn: ({ id, startTime, endTime }: { id: string; startTime: string; endTime: string }) =>
      updateBookingTimes(id, { startTime, endTime }),
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });

  function saveEdit() {
    if (!editing) return;
    const start = new Date(editing.start);
    const end = new Date(editing.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
    timesMutation.mutate({
      id: editing.id,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });
  }

  function handleReject(booking: AdminBooking) {
    const reason = window.prompt(
      `Reject this booking for ${booking.mother.name}?\n\nOptional reason (shown to the mother):`,
    );
    if (reason === null) return; // cancelled
    rejectMutation.mutate({ id: booking.id, reason: reason.trim() || undefined });
  }

  function handleOverride(booking: AdminBooking, event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    if (next === booking.status) return;
    statusMutation.mutate({ id: booking.id, status: next });
  }

  const mutationError =
    approveMutation.error ?? rejectMutation.error ?? statusMutation.error ?? timesMutation.error;
  const mutating =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    statusMutation.isPending ||
    timesMutation.isPending;

  return (
    <section>
      <PageHeader
        title="Bookings"
        subtitle="Requests are broadcast to all nannies; the first to accept claims a booking and the parent pays. Edit a booking's times or override its status here."
      />
      <div className="filter-row">
        {STATUS_FILTERS.map((filter) => (
          <Button
            key={filter.value}
            size="sm"
            variant={filter.value === status ? 'primary' : 'ghost'}
            onClick={() => setStatus(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>
      {isLoading && <p>Loading bookings…</p>}
      {error != null && <Feedback tone="error">{apiErrorMessage(error)}</Feedback>}
      {mutationError != null && (
        <Feedback tone="error">{apiErrorMessage(mutationError)}</Feedback>
      )}
      {bookings && bookings.length === 0 && (
        <Card>
          <p className="empty-state">No bookings with this status.</p>
        </Card>
      )}
      {bookings && bookings.length > 0 && (
        <Card flush>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Mother</th>
                  <th>Nanny</th>
                  <th>Starts</th>
                  <th>Ends</th>
                  <th>Total (EGP)</th>
                  <th>Promo</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Override</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking: AdminBooking) => {
                  const isCompleted = booking.status === 'COMPLETED';
                  const isTerminal = TERMINAL_STATUSES.has(booking.status);
                  const isEditing = editing?.id === booking.id;
                  const options = OVERRIDE_STATUSES.some((s) => s === booking.status)
                    ? OVERRIDE_STATUSES
                    : [booking.status, ...OVERRIDE_STATUSES];
                  return (
                    <Fragment key={booking.id}>
                    <tr>
                      <td>
                        {booking.mother.name}
                        {booking.mother.phone && (
                          <div className="table-subtext">{booking.mother.phone}</div>
                        )}
                      </td>
                      <td>
                        {booking.nanny?.name ?? '—'}
                        <div className="table-subtext">
                          Nanny: {nannyDecisionLabel(booking.nannyDecision)}
                        </div>
                      </td>
                      <td>{formatDateTime(booking.startTime)}</td>
                      <td>{formatDateTime(booking.endTime)}</td>
                      <td>{booking.totalAmount.toFixed(2)}</td>
                      <td>
                        {booking.promoCode
                          ? `${booking.promoCode} (−${booking.discountAmount.toFixed(2)})`
                          : '—'}
                      </td>
                      <td>{booking.paymentStatus ? statusLabel(booking.paymentStatus) : '—'}</td>
                      <td>
                        <Badge tone={statusTone(booking.status)}>
                          {statusLabel(booking.status)}
                        </Badge>
                      </td>
                      <td>
                        <select
                          className="status-select"
                          value={booking.status}
                          disabled={mutating || isCompleted}
                          title={
                            isCompleted ? 'Completed bookings are locked' : 'Override booking status'
                          }
                          aria-label={`Override status for ${booking.mother.name}'s booking`}
                          onChange={(event) => handleOverride(booking, event)}
                        >
                          {options.map((option) => (
                            <option key={option} value={option}>
                              {statusLabel(option)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="table-actions">
                          {booking.status === 'PENDING' && (
                            <>
                              <Button
                                size="sm"
                                disabled={mutating}
                                onClick={() => approveMutation.mutate(booking.id)}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={mutating}
                                onClick={() => handleReject(booking)}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          {!isTerminal && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={mutating}
                              onClick={() =>
                                setEditing({
                                  id: booking.id,
                                  start: toDateTimeLocal(booking.startTime),
                                  end: toDateTimeLocal(booking.endTime),
                                })
                              }
                            >
                              Edit times
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isEditing && editing && (
                      <tr>
                        <td colSpan={10}>
                          <div className="times-editor">
                            <label>
                              Starts
                              <input
                                type="datetime-local"
                                value={editing.start}
                                onChange={(e) => setEditing({ ...editing, start: e.target.value })}
                              />
                            </label>
                            <label>
                              Ends
                              <input
                                type="datetime-local"
                                value={editing.end}
                                onChange={(e) => setEditing({ ...editing, end: e.target.value })}
                              />
                            </label>
                            <Button size="sm" disabled={mutating} onClick={saveEdit}>
                              Save times
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={mutating}
                              onClick={() => setEditing(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </section>
  );
}
