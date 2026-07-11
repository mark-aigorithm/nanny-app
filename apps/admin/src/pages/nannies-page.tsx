import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { AdminNanny, AdminNannyStatusFilter } from '@nanny-app/shared';

import { Badge, Button, Card, Feedback, PageHeader } from '@admin/components/ui';
import { approveNanny, fetchNannies, rejectNanny } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

const STATUS_FILTERS: { value: AdminNannyStatusFilter; label: string }[] = [
  { value: 'PENDING_REVIEW', label: 'Pending review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ALL', label: 'All' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function statusTone(status: AdminNanny['approvalStatus']): 'success' | 'danger' | 'neutral' {
  if (status === 'APPROVED') return 'success';
  if (status === 'REJECTED') return 'danger';
  return 'neutral';
}

function statusLabel(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase();
}

export function NanniesPage() {
  const [status, setStatus] = useState<AdminNannyStatusFilter>('PENDING_REVIEW');
  const queryClient = useQueryClient();

  const { data: nannies, isLoading, error } = useQuery({
    queryKey: ['admin-nannies', status],
    queryFn: () => fetchNannies(status),
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['admin-nannies'] });

  const approveMutation = useMutation({
    mutationFn: approveNanny,
    onSuccess: invalidate,
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      rejectNanny(id, reason),
    onSuccess: invalidate,
  });

  function handleReject(nanny: AdminNanny) {
    const reason = window.prompt(
      `Reject ${nanny.name}'s application?\n\nOptional reason (shown to the nanny):`,
    );
    if (reason === null) return; // cancelled
    rejectMutation.mutate({ id: nanny.id, reason: reason.trim() || undefined });
  }

  const mutationError = approveMutation.error ?? rejectMutation.error;
  const mutating = approveMutation.isPending || rejectMutation.isPending;

  return (
    <section>
      <PageHeader
        title="New Nannies"
        subtitle="New nanny registrations wait here until reviewed — contact them for KYC, then approve or reject. Approving notifies the nanny and lets her into the app."
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
      {isLoading && <p>Loading nannies…</p>}
      {error != null && <Feedback tone="error">{apiErrorMessage(error)}</Feedback>}
      {mutationError != null && (
        <Feedback tone="error">{apiErrorMessage(mutationError)}</Feedback>
      )}
      {nannies && nannies.length === 0 && (
        <Card>
          <p className="empty-state">No nannies with this status.</p>
        </Card>
      )}
      {nannies && nannies.length > 0 && (
        <Card flush>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nanny</th>
                  <th>Contact</th>
                  <th>Location</th>
                  <th>Experience</th>
                  <th>Rate (EGP/h)</th>
                  <th>Verified</th>
                  <th>Registered</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {nannies.map((nanny: AdminNanny) => (
                  <tr key={nanny.id}>
                    <td>
                      {nanny.name}
                      {nanny.dateOfBirth && (
                        <div className="table-subtext">Born {formatDate(nanny.dateOfBirth)}</div>
                      )}
                    </td>
                    <td>
                      <a href={`mailto:${nanny.email}`}>{nanny.email}</a>
                      {nanny.phone && (
                        <div className="table-subtext">
                          <a href={`tel:${nanny.phone}`}>{nanny.phone}</a>
                        </div>
                      )}
                    </td>
                    <td>{nanny.location ?? '—'}</td>
                    <td>
                      {nanny.yearsOfExperience !== null
                        ? `${nanny.yearsOfExperience} yrs`
                        : '—'}
                      {nanny.certifications.length > 0 && (
                        <div className="table-subtext">
                          {nanny.certifications.join(', ')}
                        </div>
                      )}
                    </td>
                    <td>{nanny.hourlyRate !== null ? nanny.hourlyRate.toFixed(2) : '—'}</td>
                    <td>
                      {[
                        nanny.isEmailVerified ? 'email' : null,
                        nanny.isPhoneVerified ? 'phone' : null,
                      ]
                        .filter(Boolean)
                        .join(', ') || '—'}
                    </td>
                    <td>{formatDate(nanny.createdAt)}</td>
                    <td>
                      <Badge tone={statusTone(nanny.approvalStatus)}>
                        {statusLabel(nanny.approvalStatus)}
                      </Badge>
                      {nanny.rejectionReason && (
                        <div className="table-subtext">{nanny.rejectionReason}</div>
                      )}
                    </td>
                    <td>
                      {nanny.approvalStatus !== 'APPROVED' && (
                        <Button
                          size="sm"
                          disabled={mutating}
                          onClick={() => approveMutation.mutate(nanny.id)}
                        >
                          Approve
                        </Button>
                      )}{' '}
                      {nanny.approvalStatus === 'PENDING_REVIEW' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={mutating}
                          onClick={() => handleReject(nanny)}
                        >
                          Reject
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
