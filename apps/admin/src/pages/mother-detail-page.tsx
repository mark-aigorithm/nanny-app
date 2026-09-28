import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { formatAddressArea } from '@nanny-app/shared';

import {
  Badge,
  Button,
  Card,
  ClipboardList,
  Clock,
  DescriptionList,
  DetailHeader,
  ErrorState,
  ICON_SIZE,
  LoadingState,
  Pencil,
  PromptDialog,
  StaleRefreshBanner,
  StatCard,
  useToast,
} from '@admin/components/ui';
import { IdDocumentModal } from '@admin/features/nannies/id-document-modal';
import { MotherEditForm } from '@admin/features/users/mother-edit-form';
import { ID_TYPE_LABEL, IdPhotos, ProfileSummary } from '@admin/features/users/profile-detail';
import { RequestNewIdButton } from '@admin/features/users/request-new-id-button';
import { approveMother, fetchMother, invalidateMotherId, rejectMother } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { approvalStatusLabel, approvalStatusTone } from '@admin/lib/approval-status';
import { formatHours } from '@admin/lib/format';
import { useCanManage } from '@admin/lib/permissions';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

const DASH = <span className="table-empty">—</span>;

export function MotherDetailPage() {
  const canManage = useCanManage('users');
  const { id = '' } = useParams();
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [idOpen, setIdOpen] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();

  const {
    data: mother,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['mother', id],
    queryFn: () => fetchMother(id),
    enabled: id !== '',
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['mother', id] });
    void queryClient.invalidateQueries({ queryKey: ['admin-mothers'] });
    // The ID-review gallery's own list query, so a card it already fetched
    // can't still show "Approve" for an ID this just invalidated.
    void queryClient.invalidateQueries({ queryKey: ['admin-id-reviews'] });
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
  const canReview = canManage && mother?.approvalStatus === 'PENDING_REVIEW';

  const actions = mother ? (
    <>
      {canManage && (
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          <Pencil size={ICON_SIZE.inline} aria-hidden />
          Edit
        </Button>
      )}
      {canReview && (
        <Button size="sm" disabled={mutating} onClick={() => approveMutation.mutate()}>
          Approve ID
        </Button>
      )}
      {canReview && (
        <Button variant="danger" size="sm" disabled={mutating} onClick={() => setRejecting(true)}>
          Reject ID
        </Button>
      )}
    </>
  ) : undefined;

  return (
    <section>
      <DetailHeader
        backTo="/users?tab=mommies"
        backLabel="Back to mommies"
        title={mother ? mother.name : 'Mommy details'}
        subtitle={
          mother ? `User ID ${mother.id} · Joined ${formatDate(mother.createdAt)}` : undefined
        }
        actions={actions}
      />

      {isLoading && <LoadingState label="Loading account…" />}
      {error != null && !mother && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {mother && (
        <>
          {error != null && (
            <StaleRefreshBanner
              message={apiErrorMessage(error)}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}

          <ProfileSummary
            name={mother.name}
            avatarUrl={mother.avatarUrl}
            email={mother.email}
            phone={mother.phone}
            isEmailVerified={mother.isEmailVerified}
            isPhoneVerified={mother.isPhoneVerified}
            badges={
              <>
                <Badge tone={mother.isActive ? 'success' : 'danger'}>
                  {mother.isActive ? 'active' : 'deactivated'}
                </Badge>
                {mother.approvalStatus && (
                  <Badge tone={approvalStatusTone(mother.approvalStatus)}>
                    {approvalStatusLabel(mother.approvalStatus)}
                  </Badge>
                )}
              </>
            }
          />

          <div className="stat-grid stat-grid--fit">
            <StatCard
              label="Bookings placed"
              value={mother.bookingCount}
              icon={<ClipboardList size={ICON_SIZE.stat} aria-hidden />}
            />
            <StatCard
              label="Hours booked"
              value={formatHours(mother.hoursBooked)}
              icon={<Clock size={ICON_SIZE.stat} aria-hidden />}
              iconTone="gold"
              hint="Excludes cancelled and refunded bookings"
            />
          </div>

          {/* Same shape as the nanny record: paired cards share a row so their
              edges line up. */}
          <div className="detail-grid">
            <Card
              title="Application"
              action={
                canManage && hasId ? (
                  <RequestNewIdButton
                    name={mother.name}
                    consequence="Until it's approved she can't book care."
                    request={(reason) => invalidateMotherId(id, reason)}
                    onDone={invalidate}
                  />
                ) : undefined
              }
            >
              <DescriptionList
                items={[
                  {
                    label: 'ID status',
                    value: mother.approvalStatus ? (
                      <Badge tone={approvalStatusTone(mother.approvalStatus)}>
                        {approvalStatusLabel(mother.approvalStatus)}
                      </Badge>
                    ) : (
                      DASH
                    ),
                  },
                  {
                    label: 'ID document',
                    value: mother.idDocumentType ? ID_TYPE_LABEL[mother.idDocumentType] : DASH,
                  },
                  {
                    label: 'Registered',
                    value: formatDate(mother.createdAt),
                  },
                  {
                    label: 'Reviewed',
                    value: mother.reviewedAt ? formatDate(mother.reviewedAt) : DASH,
                  },
                  ...(mother.rejectionReason
                    ? [
                        {
                          label:
                            mother.approvalStatus === 'REJECTED'
                              ? 'Rejection reason'
                              : 'Reason for new ID',
                          value: mother.rejectionReason,
                          wide: true,
                        },
                      ]
                    : []),
                  {
                    label: 'ID photos',
                    wide: true,
                    value: <IdPhotos subject={mother} onOpen={() => setIdOpen(true)} />,
                  },
                ]}
              />
            </Card>

            <Card title="Addresses">
              {mother.addresses.length === 0 ? (
                <p className="table-subtext">No addresses on file.</p>
              ) : (
                <ul className="address-list">
                  {mother.addresses.map((address) => {
                    const area = formatAddressArea(address);
                    const details = [area, address.landmark].filter(Boolean).join(' · ');
                    return (
                      <li key={address.id} className="address-list-item">
                        <div className="address-list-head">
                          <strong>{address.label}</strong>
                          {address.isDefault && <Badge tone="success">Default</Badge>}
                        </div>
                        {address.formattedAddress ? (
                          <div>{address.formattedAddress}</div>
                        ) : (
                          <div className="table-subtext">No street address on file.</div>
                        )}
                        {details && <div className="table-subtext">{details}</div>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}

      {editing && mother && <MotherEditForm mother={mother} onClose={() => setEditing(false)} />}

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
