import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import type { AdminNannyDetail } from '@nanny-app/shared';

import {
  Badge,
  Button,
  Card,
  DescriptionList,
  type DescriptionItem,
  DetailHeader,
  ErrorState,
  LoadingState,
  PromptDialog,
  useToast,
} from '@admin/components/ui';
import { IdDocumentModal } from '@admin/features/nannies/id-document-modal';
import { NannySkillsEditor } from '@admin/features/nannies/nanny-skills-editor';
import { approveNanny, fetchNanny, fetchSkills, rejectNanny } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function money(n: number): string {
  return `EGP ${n.toFixed(2)}`;
}

function statusLabel(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase();
}

function statusTone(
  status: AdminNannyDetail['idVerificationStatus'],
): 'success' | 'danger' | 'neutral' {
  if (status === 'APPROVED') return 'success';
  if (status === 'REJECTED') return 'danger';
  return 'neutral';
}

const DASH = <span className="table-empty">—</span>;

export function NannyDetailPage() {
  const { id = '' } = useParams();
  const [rejecting, setRejecting] = useState(false);
  const [editingSkills, setEditingSkills] = useState(false);
  const [idOpen, setIdOpen] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: nanny, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['nanny', id],
    queryFn: () => fetchNanny(id),
    enabled: id !== '',
  });

  const { data: allSkills } = useQuery({ queryKey: ['skills'], queryFn: fetchSkills });
  const activeSkills = (allSkills ?? []).filter((s) => s.isActive);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['nanny', id] });
    void queryClient.invalidateQueries({ queryKey: ['admin-nannies'] });
  };

  const approveMutation = useMutation({
    mutationFn: () => approveNanny(id),
    onSuccess: (updated) => {
      invalidate();
      toast.success('Nanny approved', updated.name);
    },
    onError: (err) => toast.error('Couldn’t approve nanny', apiErrorMessage(err)),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason?: string) => rejectNanny(id, reason),
    onSuccess: () => {
      invalidate();
      setRejecting(false);
      toast.success('Nanny rejected');
    },
    onError: (err) => toast.error('Couldn’t reject nanny', apiErrorMessage(err)),
  });

  const mutating = approveMutation.isPending || rejectMutation.isPending;
  const hasId = Boolean(nanny?.idDocumentFrontUrl || nanny?.idDocumentBackUrl);

  const actions = nanny ? (
    <>
      {hasId && (
        <Button variant="ghost" size="sm" onClick={() => setIdOpen(true)}>
          View ID
        </Button>
      )}
      {nanny.idVerificationStatus !== 'APPROVED' && (
        <Button
          size="sm"
          disabled={mutating}
          onClick={() => approveMutation.mutate()}
        >
          Approve
        </Button>
      )}
      {nanny.idVerificationStatus === 'PENDING_REVIEW' && (
        <Button variant="danger" size="sm" disabled={mutating} onClick={() => setRejecting(true)}>
          Reject
        </Button>
      )}
    </>
  ) : undefined;

  return (
    <section>
      <DetailHeader
        backTo="/users"
        backLabel="Back to users"
        title={nanny ? nanny.name : 'Nanny details'}
        subtitle={nanny ? statusLabel(nanny.idVerificationStatus) : undefined}
        actions={actions}
      />

      {isLoading && <LoadingState label="Loading nanny…" />}
      {error != null && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}

      {nanny && (
        <>
          <Card title="Profile">
            <DescriptionList items={profileItems(nanny)} />
          </Card>

          <Card title="Earnings">
            <DescriptionList
              items={[
                { label: 'Amount gained', value: <strong>{money(nanny.amountGained)}</strong> },
                { label: 'Completed bookings', value: nanny.completedBookings },
              ]}
            />
          </Card>

          <Card title="Identifiers">
            <DescriptionList
              items={[
                { label: 'Nanny profile ID', value: <code>{nanny.id}</code> },
                { label: 'User ID', value: <code>{nanny.userId}</code> },
              ]}
            />
          </Card>

          <Card title="Skills">
            {editingSkills ? (
              <NannySkillsEditor
                nanny={nanny}
                skills={activeSkills}
                onDone={() => setEditingSkills(false)}
              />
            ) : (
              <div className="detail-skills">
                {nanny.skills.length > 0 ? (
                  <div className="detail-skills-list">
                    {nanny.skills.map((skill) => (
                      <Badge key={skill.id} tone="neutral">
                        {skill.name}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="table-subtext">No skills assigned yet.</p>
                )}
                <Button size="sm" variant="ghost" onClick={() => setEditingSkills(true)}>
                  Edit skills
                </Button>
              </div>
            )}
          </Card>
        </>
      )}

      {rejecting && nanny && (
        <PromptDialog
          title="Reject application"
          message={`Reject ${nanny.name}'s application?`}
          label="Reason (optional — shown to the nanny)"
          placeholder="e.g. Couldn’t verify ID documents"
          confirmLabel="Reject nanny"
          danger
          multiline
          busy={rejectMutation.isPending}
          onSubmit={(reason) => rejectMutation.mutate(reason || undefined)}
          onCancel={() => setRejecting(false)}
        />
      )}

      {idOpen && nanny && <IdDocumentModal subject={nanny} onClose={() => setIdOpen(false)} />}
    </section>
  );
}

function profileItems(nanny: AdminNannyDetail): DescriptionItem[] {
  return [
    {
      label: 'Status',
      value: (
        <>
          <Badge tone={statusTone(nanny.idVerificationStatus)}>
            {statusLabel(nanny.idVerificationStatus)}
          </Badge>
          {nanny.rejectionReason && <div className="table-subtext">{nanny.rejectionReason}</div>}
        </>
      ),
    },
    { label: 'Email', value: nanny.email },
    { label: 'Phone', value: nanny.phone ?? DASH },
    { label: 'Location', value: nanny.location ?? DASH },
    { label: 'Date of birth', value: nanny.dateOfBirth ? formatDate(nanny.dateOfBirth) : DASH },
    {
      label: 'Experience',
      value: nanny.yearsOfExperience !== null ? `${nanny.yearsOfExperience} yrs` : DASH,
    },
    {
      label: 'Certifications',
      value:
        nanny.certifications.length > 0
          ? nanny.certifications.map((c) => c.name).join(', ')
          : DASH,
      wide: true,
    },
    { label: 'Bio', value: nanny.bio ?? DASH, wide: true },
    {
      label: 'Verification',
      value:
        [nanny.isEmailVerified ? 'email' : null, nanny.isPhoneVerified ? 'phone' : null]
          .filter(Boolean)
          .join(' & ') || 'none',
    },
    { label: 'Registered', value: formatDate(nanny.createdAt) },
    { label: 'Reviewed at', value: nanny.reviewedAt ? formatDate(nanny.reviewedAt) : DASH },
  ];
}
