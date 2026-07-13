import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  BookingStatusSchema,
  SetBookingStatusSchema,
  type AdminBooking,
  type AdminBookingStatusFilter,
  type NannyBookingDecision,
} from '@nanny-app/shared';

import {
  ActionMenu,
  Badge,
  Ban,
  Button,
  Check,
  type Column,
  ErrorState,
  FilterSelect,
  ICON_SIZE,
  MenuItem,
  MenuSeparator,
  PageHeader,
  Pencil,
  PromptDialog,
  Select,
  Table,
  TableSkeleton,
  useToast,
} from '@admin/components/ui';
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
  const [rejecting, setRejecting] = useState<AdminBooking | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: bookings, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['bookings', status],
    queryFn: () => fetchBookings(status),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['bookings'] });

  const approveMutation = useMutation({
    mutationFn: approveBooking,
    onSuccess: () => {
      invalidate();
      toast.success('Booking approved');
    },
    onError: (err) => toast.error('Couldn’t approve booking', apiErrorMessage(err)),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => rejectBooking(id, reason),
    onSuccess: () => {
      invalidate();
      setRejecting(null);
      toast.success('Booking rejected');
    },
    onError: (err) => toast.error('Couldn’t reject booking', apiErrorMessage(err)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status: next }: { id: string; status: AdminBooking['status'] }) => {
      const parsed = SetBookingStatusSchema.parse({ status: next });
      return setBookingStatus(id, parsed.status);
    },
    onSuccess: (updated) => {
      invalidate();
      toast.success('Status updated', statusLabel(updated.status));
    },
    onError: (err) => toast.error('Couldn’t update status', apiErrorMessage(err)),
  });

  const timesMutation = useMutation({
    mutationFn: ({ id, startTime, endTime }: { id: string; startTime: string; endTime: string }) =>
      updateBookingTimes(id, { startTime, endTime }),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success('Times updated');
    },
    onError: (err) => toast.error('Couldn’t update times', apiErrorMessage(err)),
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

  const mutating =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    statusMutation.isPending ||
    timesMutation.isPending;

  const columns: Column<AdminBooking>[] = [
    {
      key: 'mother',
      header: 'Mother',
      render: (booking) => (
        <>
          {booking.mother.name}
          {booking.mother.phone && <div className="table-subtext">{booking.mother.phone}</div>}
        </>
      ),
    },
    {
      key: 'nanny',
      header: 'Nanny',
      render: (booking) => (
        <>
          {booking.nanny?.name ?? '—'}
          <div className="table-subtext">Nanny: {nannyDecisionLabel(booking.nannyDecision)}</div>
        </>
      ),
    },
    { key: 'starts', header: 'Starts', nowrap: true, render: (b) => formatDateTime(b.startTime) },
    { key: 'ends', header: 'Ends', nowrap: true, render: (b) => formatDateTime(b.endTime) },
    {
      key: 'total',
      header: 'Total (EGP)',
      align: 'right',
      render: (b) => b.totalAmount.toFixed(2),
    },
    {
      key: 'promo',
      header: 'Promo',
      render: (b) =>
        b.promoCode ? (
          `${b.promoCode} (−${b.discountAmount.toFixed(2)})`
        ) : (
          <span className="table-empty">—</span>
        ),
    },
    {
      key: 'payment',
      header: 'Payment',
      render: (b) =>
        b.paymentStatus ? statusLabel(b.paymentStatus) : <span className="table-empty">—</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (b) => <Badge tone={statusTone(b.status)}>{statusLabel(b.status)}</Badge>,
    },
    {
      key: 'override',
      header: 'Override',
      render: (booking) => {
        const isCompleted = booking.status === 'COMPLETED';
        const options = OVERRIDE_STATUSES.some((s) => s === booking.status)
          ? OVERRIDE_STATUSES
          : [booking.status, ...OVERRIDE_STATUSES];
        return (
          <Select
            compact
            value={booking.status}
            disabled={mutating || isCompleted}
            title={isCompleted ? 'Completed bookings are locked' : 'Override booking status'}
            aria-label={`Override status for ${booking.mother.name}'s booking`}
            options={options.map((option) => ({ value: option, label: statusLabel(option) }))}
            onChange={(next) =>
              statusMutation.mutate({ id: booking.id, status: next as AdminBooking['status'] })
            }
          />
        );
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (booking) => {
        const isPending = booking.status === 'PENDING';
        const isTerminal = TERMINAL_STATUSES.has(booking.status);
        if (!isPending && isTerminal) {
          return <span className="table-empty">—</span>;
        }
        return (
          <ActionMenu label={`Actions for ${booking.mother.name}'s booking`} disabled={mutating}>
            {isPending && (
              <MenuItem
                icon={<Check size={ICON_SIZE.menu} />}
                onSelect={() => approveMutation.mutate(booking.id)}
              >
                Approve
              </MenuItem>
            )}
            {!isTerminal && (
              <MenuItem
                icon={<Pencil size={ICON_SIZE.menu} />}
                onSelect={() =>
                  setEditing({
                    id: booking.id,
                    start: toDateTimeLocal(booking.startTime),
                    end: toDateTimeLocal(booking.endTime),
                  })
                }
              >
                Edit times
              </MenuItem>
            )}
            {isPending && (
              <>
                <MenuSeparator />
                <MenuItem
                  danger
                  icon={<Ban size={ICON_SIZE.menu} />}
                  onSelect={() => setRejecting(booking)}
                >
                  Reject
                </MenuItem>
              </>
            )}
          </ActionMenu>
        );
      },
    },
  ];

  return (
    <section>
      <PageHeader
        title="Bookings"
        subtitle="Requests are broadcast to all nannies; the first to accept claims a booking and the parent pays. Edit a booking's times or override its status here."
      />
      <div className="filter-bar">
        <FilterSelect
          label="Status"
          value={status}
          options={STATUS_FILTERS}
          onChange={(value) => setStatus(value as AdminBookingStatusFilter)}
        />
      </div>
      {isLoading && <TableSkeleton columns={9} />}
      {error != null && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {bookings && (
        <Table
          columns={columns}
          rows={bookings}
          rowKey={(booking) => booking.id}
          empty="No bookings with this status."
          renderExpanded={(booking) =>
            editing?.id === booking.id ? (
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
            ) : null
          }
        />
      )}

      {rejecting && (
        <PromptDialog
          title="Reject booking"
          message={`Reject this booking for ${rejecting.mother.name}?`}
          label="Reason (optional — shown to the mother)"
          placeholder="e.g. No nanny available for this time"
          confirmLabel="Reject booking"
          danger
          multiline
          busy={rejectMutation.isPending}
          onSubmit={(reason) => rejectMutation.mutate({ id: rejecting.id, reason: reason || undefined })}
          onCancel={() => setRejecting(null)}
        />
      )}
    </section>
  );
}
