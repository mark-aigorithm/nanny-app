import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { AdminBookingCandidate } from '@nanny-app/shared';

import {
  Badge,
  Button,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  useToast,
} from '@admin/components/ui';
import { assignBookingNanny, fetchBookingCandidates } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

/** The booking fields the picker needs — both the list and detail DTOs satisfy it. */
export type AssignableBooking = {
  id: number;
  status: string;
  date: string;
  nanny: { id: number; name: string } | null;
};

type AssignNannyModalProps = {
  booking: AssignableBooking;
  onClose: () => void;
};

const SEARCH_DEBOUNCE_MS = 250;
/** Matches the schema's cap (`AdminBookingCandidateQuerySchema`) — see the hint below the list. */
export const CANDIDATE_PAGE_SIZE = 50;

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function ratingLabel(c: AdminBookingCandidate): string {
  return c.reviewCount > 0 ? `★ ${c.rating.toFixed(1)} (${c.reviewCount})` : 'No reviews yet';
}

/**
 * Searchable radio list of the nannies an admin may put on this booking. The
 * server decides eligibility (see AdminBookingCandidate); this only makes the
 * verdicts legible — a busy nanny can't be picked, the soft warnings can be
 * overridden knowingly — and says up front when choosing also approves.
 */
export function AssignNannyModal({ booking, onClose }: AssignNannyModalProps) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), SEARCH_DEBOUNCE_MS);
  const [selected, setSelected] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: candidates, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['booking-candidates', booking.id, q],
    queryFn: () => fetchBookingCandidates(booking.id, q || undefined, CANDIDATE_PAGE_SIZE),
    placeholderData: keepPreviousData,
  });

  // The stored id can point at a row that isn't rendered any more — filtered
  // out by a narrower search, or flipped to a conflict by a refetch — so the
  // choice is derived from the current list on every render, never trusted.
  const selectedCandidate = candidates?.find((c) => c.id === selected && !c.conflict) ?? null;

  const mutation = useMutation({
    mutationFn: (nannyProfileId: number) => assignBookingNanny(booking.id, nannyProfileId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      // The detail page keys on the route param, which is a string.
      void queryClient.invalidateQueries({ queryKey: ['booking', String(booking.id)] });
      toast.success('Nanny assigned');
      onClose();
    },
    onError: (err) => {
      // A 409 means the booking changed under the admin — refresh what's
      // behind the modal so the retry (or a plain close) sees fresh state.
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      void queryClient.invalidateQueries({ queryKey: ['booking', String(booking.id)] });
      toast.error('Couldn’t assign nanny', apiErrorMessage(err));
    },
  });

  const approving = booking.status === 'PENDING';
  const title = booking.nanny ? 'Change nanny' : 'Assign nanny';
  const confirmLabel = approving ? 'Assign & approve' : title;

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => selectedCandidate !== null && mutation.mutate(selectedCandidate.id)}
            disabled={selectedCandidate === null || mutation.isPending}
          >
            {mutation.isPending ? 'Assigning…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="candidate-picker">
        {booking.nanny && (
          <p className="candidate-current">
            Currently assigned: <strong>{booking.nanny.name}</strong>
          </p>
        )}
        {approving && (
          <p className="field-hint">
            The parent will be asked to pay once the nanny is assigned.
          </p>
        )}
        <label className="candidate-search">
          <span className="sr-only">Search nannies</span>
          <Input
            type="search"
            placeholder="Search by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </label>

        {isLoading && <LoadingState label="Loading nannies…" />}
        {error != null && !candidates && (
          <ErrorState
            message={apiErrorMessage(error)}
            onRetry={() => void refetch()}
            retrying={isFetching}
          />
        )}
        {candidates && candidates.length === 0 && (
          <p className="empty-state">No approved nannies match.</p>
        )}
        {candidates && candidates.length > 0 && (
          <ul className="candidate-list" role="radiogroup" aria-label="Nannies">
            {candidates.map((c) => {
              const classes = [
                'candidate-row',
                c.id === selected && 'candidate-row--selected',
                c.conflict && 'candidate-row--disabled',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <li key={c.id}>
                  <label className={classes} title={c.conflict ? 'Has an overlapping booking' : undefined}>
                    <input
                      type="radio"
                      name="candidate"
                      value={c.id}
                      checked={c.id === selected}
                      disabled={c.conflict}
                      onChange={() => setSelected(c.id)}
                    />
                    <span className="candidate-main">
                      <span className="candidate-name">{c.name}</span>
                      <span className="candidate-meta">
                        <span>{ratingLabel(c)}</span>
                        {c.phone && <span> · {c.phone}</span>}
                      </span>
                    </span>
                    <span className="candidate-badges">
                      {c.conflict && <Badge tone="danger">Busy</Badge>}
                      {c.missingSkills.length > 0 && (
                        <Badge tone="warning">Missing: {c.missingSkills.join(', ')}</Badge>
                      )}
                      {c.outsideRadius && c.distanceKm !== null && (
                        <Badge tone="warning">{c.distanceKm} km away</Badge>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {candidates && candidates.length === CANDIDATE_PAGE_SIZE && (
          <p className="field-hint">{`Showing the first ${CANDIDATE_PAGE_SIZE} nannies — search to narrow the list.`}</p>
        )}
      </div>
    </Modal>
  );
}
