import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import type { AdminMother } from '@nanny-app/shared';

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
import { approveMother, fetchMother, rejectMother } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function statusLabel(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase();
}

function statusTone(
  status: AdminMother['idVerificationStatus'],
): 'success' | 'danger' | 'neutral' {
  if (status === 'APPROVED') return 'success';
  if (status === 'REJECTED') return 'danger';
  return 'neutral';
}

const DASH = <span className="table-empty">—</span>;

export function MotherDetailPage() {
  const { id = '' } = useParams();
  const [rejecting, setRejecting] = useState(false);
  const [idOpen, setIdOpen] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: mother, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['mother', id],
    queryFn: () => fetchMother(id),
    enabled: id !== '',
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['mother', id] });
    void queryClient.invalidateQueries({ queryKey: ['admin-mothers'] });
  };

  const approveMutation = useMutation({
    mutationFn: () => approveMother(id),
    onSuccess: (updated) => {
      invalidate();
      toast.success('ID verified', updated.name);
    },
    onError: (err) => toast.error('Couldn’t verify ID', apiErrorMessage(err)),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason?: string) => rejectMother(id, reason),
    onSuccess: () => {
      invalidate();
      setRejecting(false);
      toast.success('ID rejected');
    },
    onError: (err) => toast.error('Couldn’t reject ID', apiErrorMessage(err)),
  });

  const mutating = approveMutation.isPending || rejectMutation.isPending;
  const hasId = Boolean(mother?.idDocumentFrontUrl || mother?.idDocumentBackUrl);
  const canReview = mother?.idVerificationStatus === 'PENDING_REVIEW';

  const actions = mother ? (
    <>
      {hasId && (
        <Button variant="ghost" size="sm" onClick={() => setIdOpen(true)}>
          View ID
        </Button>
      )}
      {canReview && (
        <Button size="sm" disabled={mutating} onClick={() => approveMutation.mutate()}>
          Approve
        </Button>
      )}
      {canReview && (
        <Button variant="danger" size="sm" disabled={mutating} onClick={() => setRejecting(true)}>
          Reject
        </Button>
      )}
    </>
  ) : undefined;

  const profile: DescriptionItem[] = mother
    ? [
        { label: 'Name', value: mother.name },
        {
          label: 'ID status',
          value: mother.idVerificationStatus ? (
            <>
              <Badge tone={statusTone(mother.idVerificationStatus)}>
                {statusLabel(mother.idVerificationStatus)}
              </Badge>
              {mother.rejectionReason && (
                <div className="table-subtext">{mother.rejectionReason}</div>
              )}
            </>
          ) : (
            DASH
          ),
        },
        { label: 'Email', value: mother.email },
        { label: 'Phone', value: mother.phone ?? DASH },
        { label: 'Location', value: mother.location ?? DASH },
        {
          label: 'Account',
          value: (
            <Badge tone={mother.isActive ? 'success' : 'danger'}>
              {mother.isActive ? 'active' : 'deactivated'}
            </Badge>
          ),
        },
        {
          label: 'Verification',
          value:
            [mother.isEmailVerified ? 'email' : null, mother.isPhoneVerified ? 'phone' : null]
              .filter(Boolean)
              .join(' & ') || 'none',
        },
        { label: 'Bookings placed', value: mother.bookingCount },
        { label: 'Registered', value: formatDate(mother.createdAt) },
        { label: 'Reviewed at', value: mother.reviewedAt ? formatDate(mother.reviewedAt) : DASH },
        { label: 'User ID', value: <code>{mother.id}</code> },
      ]
    : [];

  return (
    <section>
      <DetailHeader
        backTo="/users"
        backLabel="Back to users"
        title={mother ? mother.name : 'Mommy details'}
        subtitle={mother?.idVerificationStatus ? statusLabel(mother.idVerificationStatus) : undefined}
        actions={actions}
      />

      {isLoading && <LoadingState label="Loading account…" />}
      {error != null && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {mother && (
        <Card title="Profile">
          <DescriptionList items={profile} />
        </Card>
      )}

      {rejecting && mother && (
        <PromptDialog
          title="Reject ID"
          message={`Reject ${mother.name}'s ID? Her photos will be removed and she'll be asked to upload a new one before booking.`}
          label="Reason (optional — shown to the mother)"
          placeholder="e.g. Photo was blurry"
          confirmLabel="Reject ID"
          danger
          multiline
          busy={rejectMutation.isPending}
          onSubmit={(reason) => rejectMutation.mutate(reason || undefined)}
          onCancel={() => setRejecting(false)}
        />
      )}

      {idOpen && mother && <IdDocumentModal subject={mother} onClose={() => setIdOpen(false)} />}
    </section>
  );
}
