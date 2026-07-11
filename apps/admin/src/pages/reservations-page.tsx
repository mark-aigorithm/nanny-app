import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { AdminBooking, AdminBookingStatusFilter } from '@nanny-app/shared';

import { Badge, Button, Card, Feedback, PageHeader } from '@admin/components/ui';
import { confirmReservation, fetchReservations } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

const STATUS_FILTERS: { value: AdminBookingStatusFilter; label: string }[] = [
  { value: 'PENDING_CONFIRMATION', label: 'Awaiting confirmation' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'ALL', label: 'All' },
];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function statusLabel(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase();
}

export function ReservationsPage() {
  const [status, setStatus] = useState<AdminBookingStatusFilter>('PENDING_CONFIRMATION');
  const queryClient = useQueryClient();

  const { data: bookings, isLoading, error } = useQuery({
    queryKey: ['reservations', status],
    queryFn: () => fetchReservations(status),
  });

  const confirmMutation = useMutation({
    mutationFn: confirmReservation,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['reservations'] }),
  });

  return (
    <section>
      <PageHeader
        title="Reservations"
        subtitle="Paid bookings wait here until an admin accepts them — accepting notifies the nanny."
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
      {isLoading && <p>Loading reservations…</p>}
      {error != null && <Feedback tone="error">{apiErrorMessage(error)}</Feedback>}
      {confirmMutation.error != null && (
        <Feedback tone="error">{apiErrorMessage(confirmMutation.error)}</Feedback>
      )}
      {bookings && bookings.length === 0 && (
        <Card>
          <p className="empty-state">No reservations with this status.</p>
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
                  <th>Payment</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking: AdminBooking) => (
                  <tr key={booking.id}>
                    <td>
                      {booking.mother.name}
                      {booking.mother.phone && (
                        <div className="table-subtext">{booking.mother.phone}</div>
                      )}
                    </td>
                    <td>{booking.nanny?.name ?? '—'}</td>
                    <td>{formatDateTime(booking.startTime)}</td>
                    <td>{formatDateTime(booking.endTime)}</td>
                    <td>{booking.totalAmount.toFixed(2)}</td>
                    <td>{booking.paymentStatus ? statusLabel(booking.paymentStatus) : '—'}</td>
                    <td>
                      <Badge tone={booking.status === 'CONFIRMED' ? 'success' : 'neutral'}>
                        {statusLabel(booking.status)}
                      </Badge>
                    </td>
                    <td>
                      {booking.status === 'PENDING_CONFIRMATION' && (
                        <Button
                          size="sm"
                          disabled={confirmMutation.isPending}
                          onClick={() => confirmMutation.mutate(booking.id)}
                        >
                          Accept
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </section>
  );
}
