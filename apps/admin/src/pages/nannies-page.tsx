import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';

import type { AdminNanny, AdminNannyStatusFilter } from '@nanny-app/shared';

import { Badge, Button, Card, Feedback, PageHeader } from '@admin/components/ui';
import { NannySkillsEditor } from '@admin/features/nannies/nanny-skills-editor';
import { approveNanny, fetchNannies, fetchSkills, rejectNanny } from '@admin/lib/api';
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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

const EMPTY = <span className="table-empty">—</span>;

export function NanniesPage() {
  const [status, setStatus] = useState<AdminNannyStatusFilter>('PENDING_REVIEW');
  // Nanny whose ID document is open in the viewer modal (null = closed).
  const [idViewNanny, setIdViewNanny] = useState<AdminNanny | null>(null);
  const [editingSkillsId, setEditingSkillsId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const {
    data: nannies,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['admin-nannies', status],
    queryFn: () => fetchNannies(status),
  });

  const { data: allSkills } = useQuery({ queryKey: ['skills'], queryFn: fetchSkills });
  const activeSkills = (allSkills ?? []).filter((s) => s.isActive);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin-nannies'] });

  const approveMutation = useMutation({
    mutationFn: approveNanny,
    onSuccess: invalidate,
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => rejectNanny(id, reason),
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
      {mutationError != null && <Feedback tone="error">{apiErrorMessage(mutationError)}</Feedback>}
      {nannies && nannies.length === 0 && (
        <Card>
          <p className="empty-state">No nannies with this status.</p>
        </Card>
      )}
      {nannies && nannies.length > 0 && (
        <Card flush>
          <table className="table table--full">
            <thead>
              <tr>
                <th>Nanny</th>
                <th>Phone number</th>
                <th>Location</th>
                <th>Experience</th>
                <th>Rate (EGP/h)</th>
                <th>ID</th>
                <th>Skills</th>
                <th>Registered</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {nannies.map((nanny: AdminNanny) => (
                <Fragment key={nanny.id}>
                <tr>
                  <td>
                    <div className="nanny-cell">
                      <span className="nanny-avatar" aria-hidden>
                        {initials(nanny.name)}
                      </span>
                      <div>
                        <div className="nanny-name">{nanny.name}</div>
                        {nanny.dateOfBirth && (
                          <div className="table-subtext">Born {formatDate(nanny.dateOfBirth)}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="cell-nowrap">
                    {nanny.phone ?? EMPTY}
                    {(nanny.isEmailVerified || nanny.isPhoneVerified) && (
                      <div className="table-subtext">
                        {[
                          nanny.isEmailVerified ? 'email' : null,
                          nanny.isPhoneVerified ? 'phone' : null,
                        ]
                          .filter(Boolean)
                          .join(' & ')}{' '}
                        verified
                      </div>
                    )}
                  </td>
                  <td>{nanny.location ?? EMPTY}</td>
                  <td>
                    {nanny.yearsOfExperience !== null ? `${nanny.yearsOfExperience} yrs` : EMPTY}
                    {nanny.certifications.length > 0 && (
                      <div className="table-subtext">{nanny.certifications.join(', ')}</div>
                    )}
                  </td>
                  <td>{nanny.hourlyRate !== null ? nanny.hourlyRate.toFixed(2) : EMPTY}</td>
                  <td>
                    {nanny.idDocumentFrontUrl || nanny.idDocumentBackUrl ? (
                      <Button size="sm" variant="ghost" onClick={() => setIdViewNanny(nanny)}>
                        View ID
                      </Button>
                    ) : (
                      EMPTY
                    )}
                  </td>
                  <td>
                    {nanny.skills.length > 0 ? (
                      <div className="skill-chips">
                        {nanny.skills.map((skill) => (
                          <Badge key={skill.id} tone="neutral">
                            {skill.name}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      EMPTY
                    )}
                  </td>
                  <td className="cell-nowrap">{formatDate(nanny.createdAt)}</td>
                  <td>
                    <Badge tone={statusTone(nanny.approvalStatus)}>
                      {statusLabel(nanny.approvalStatus)}
                    </Badge>
                    {nanny.rejectionReason && (
                      <div className="table-subtext">{nanny.rejectionReason}</div>
                    )}
                  </td>
                  <td>
                    <div className="table-actions">
                      {nanny.approvalStatus !== 'APPROVED' && (
                        <Button
                          size="sm"
                          disabled={mutating}
                          onClick={() => approveMutation.mutate(nanny.id)}
                        >
                          Approve
                        </Button>
                      )}
                      {nanny.approvalStatus === 'PENDING_REVIEW' && (
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={mutating}
                          onClick={() => handleReject(nanny)}
                        >
                          Reject
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setEditingSkillsId((id) => (id === nanny.id ? null : nanny.id))
                        }
                      >
                        {editingSkillsId === nanny.id ? 'Close' : 'Skills'}
                      </Button>
                    </div>
                  </td>
                </tr>
                {editingSkillsId === nanny.id && (
                  <tr>
                    <td colSpan={10}>
                      <NannySkillsEditor
                        nanny={nanny}
                        skills={activeSkills}
                        onDone={() => setEditingSkillsId(null)}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {idViewNanny && (
        <IdDocumentModal nanny={idViewNanny} onClose={() => setIdViewNanny(null)} />
      )}
    </section>
  );
}

function IdDocumentModal({
  nanny,
  onClose,
}: {
  nanny: AdminNanny;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`ID document for ${nanny.name}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">{nanny.name}'s ID</h2>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="modal-body">
          <div className="id-doc-grid">
            <figure className="id-doc-figure">
              <figcaption className="id-doc-caption">Front</figcaption>
              {nanny.idDocumentFrontUrl ? (
                <img
                  className="id-doc-image"
                  src={nanny.idDocumentFrontUrl}
                  alt={`Front of ${nanny.name}'s ID`}
                />
              ) : (
                <p className="table-subtext">Not provided.</p>
              )}
            </figure>
            <figure className="id-doc-figure">
              <figcaption className="id-doc-caption">Back</figcaption>
              {nanny.idDocumentBackUrl ? (
                <img
                  className="id-doc-image"
                  src={nanny.idDocumentBackUrl}
                  alt={`Back of ${nanny.name}'s ID`}
                />
              ) : (
                <p className="table-subtext">Not provided.</p>
              )}
            </figure>
          </div>
        </div>
      </div>
    </div>
  );
}
