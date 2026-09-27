import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import type { AdminNannyDetail } from '@nanny-app/shared';

import {
  Badge,
  Button,
  Card,
  ClipboardList,
  DescriptionList,
  DetailHeader,
  ErrorState,
  ICON_SIZE,
  LoadingState,
  PromptDialog,
  StaleRefreshBanner,
  StatCard,
  useToast,
  Wallet,
} from '@admin/components/ui';
import { IdDocumentModal } from '@admin/features/nannies/id-document-modal';
import { NannyAddressCard } from '@admin/features/nannies/nanny-address-card';
import { NannyCameraCard } from '@admin/features/nannies/nanny-camera-card';
import {
  NannyProfileEditor,
  availabilityLabel,
  workingDays,
} from '@admin/features/nannies/nanny-profile-editor';
import { NannySkillsEditor } from '@admin/features/nannies/nanny-skills-editor';
import { ID_TYPE_LABEL, IdPhotos, ProfileSummary } from '@admin/features/users/profile-detail';
import { RequestNewIdButton } from '@admin/features/users/request-new-id-button';
import {
  approveNanny,
  fetchCertifications,
  fetchNanny,
  fetchSkills,
  invalidateNannyId,
  rejectNanny,
} from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { approvalStatusLabel, approvalStatusTone } from '@admin/lib/approval-status';
import { formatEgp } from '@admin/lib/format';
import { useCanManage } from '@admin/lib/permissions';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

const DASH = <span className="table-empty">—</span>;

export function NannyDetailPage() {
  const canManage = useCanManage('users');
  const { id = '' } = useParams();
  const [rejecting, setRejecting] = useState(false);
  const [editingSkills, setEditingSkills] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [idOpen, setIdOpen] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();

  const {
    data: nanny,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['nanny', id],
    queryFn: () => fetchNanny(id),
    enabled: id !== '',
  });

  const { data: allSkills } = useQuery({ queryKey: ['skills'], queryFn: fetchSkills });
  const activeSkills = (allSkills ?? []).filter((s) => s.isActive);

  const { data: allCertifications } = useQuery({
    queryKey: ['certifications'],
    queryFn: fetchCertifications,
  });
  const activeCertifications = (allCertifications ?? []).filter((c) => c.isActive);

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
      toast.success('Application rejected', nanny?.name);
    },
    onError: (err) => toast.error('Couldn’t reject application', apiErrorMessage(err)),
  });

  const mutating = approveMutation.isPending || rejectMutation.isPending;

  const actions = nanny ? (
    <>
      {canManage &&
        nanny.approvalStatus !== 'APPROVED' &&
        (nanny.idDocumentFrontUrl || nanny.idDocumentBackUrl) && (
          <Button size="sm" disabled={mutating} onClick={() => approveMutation.mutate()}>
            Approve nanny
          </Button>
        )}
      {canManage && nanny.approvalStatus === 'PENDING_REVIEW' && (
        <Button variant="danger" size="sm" disabled={mutating} onClick={() => setRejecting(true)}>
          Reject application
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
        subtitle={
          nanny ? `User ID ${nanny.userId} · Joined ${formatDate(nanny.createdAt)}` : undefined
        }
        actions={actions}
      />

      {isLoading && <LoadingState label="Loading nanny…" />}
      {error != null && !nanny && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}

      {nanny && (
        <>
          {error != null && (
            <StaleRefreshBanner
              message={apiErrorMessage(error)}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}

          <ProfileSummary
            name={nanny.name}
            avatarUrl={nanny.avatarUrl}
            email={nanny.email}
            phone={nanny.phone}
            isEmailVerified={nanny.isEmailVerified}
            isPhoneVerified={nanny.isPhoneVerified}
            badges={
              <Badge tone={approvalStatusTone(nanny.approvalStatus)}>
                {approvalStatusLabel(nanny.approvalStatus)}
              </Badge>
            }
          />

          <div className="stat-grid stat-grid--fit">
            <StatCard
              label="Amount gained"
              value={formatEgp(nanny.amountGained)}
              icon={<Wallet size={ICON_SIZE.stat} aria-hidden />}
            />
            <StatCard
              label="Completed bookings"
              value={nanny.completedBookings}
              icon={<ClipboardList size={ICON_SIZE.stat} aria-hidden />}
              iconTone="gold"
            />
          </div>

          {/* Paired cards share a row, so their edges line up; the long-form
              profile cards run full width beneath them. */}
          <div className="detail-grid">
            <Card
              title="Application"
              action={
                canManage && (nanny.idDocumentFrontUrl || nanny.idDocumentBackUrl) ? (
                  <RequestNewIdButton
                    name={nanny.name}
                    consequence="Until it's approved she won't appear to parents or get new bookings. This isn't possible while she has active bookings."
                    request={(reason) => invalidateNannyId(id, reason)}
                    onDone={invalidate}
                  />
                ) : undefined
              }
            >
              <DescriptionList
                items={[
                  {
                    label: 'Status',
                    value: (
                      <Badge tone={approvalStatusTone(nanny.approvalStatus)}>
                        {approvalStatusLabel(nanny.approvalStatus)}
                      </Badge>
                    ),
                  },
                  {
                    label: 'ID document',
                    value: nanny.idDocumentType ? ID_TYPE_LABEL[nanny.idDocumentType] : DASH,
                  },
                  { label: 'Registered', value: formatDate(nanny.createdAt) },
                  {
                    label: 'Reviewed',
                    value: nanny.reviewedAt ? formatDate(nanny.reviewedAt) : DASH,
                  },
                  ...(nanny.rejectionReason
                    ? [
                        {
                          label:
                            nanny.approvalStatus === 'REJECTED'
                              ? 'Rejection reason'
                              : 'Reason for new ID',
                          value: nanny.rejectionReason,
                          wide: true,
                        },
                      ]
                    : []),
                  {
                    label: 'ID photos',
                    wide: true,
                    value: <IdPhotos subject={nanny} onOpen={() => setIdOpen(true)} />,
                  },
                ]}
              />
            </Card>

            <NannyAddressCard nanny={nanny} canManage={canManage} />

            <NannyCameraCard nanny={nanny} />

            <Card
              className="detail-grid-wide"
              title="About"
              action={
                canManage && !editingProfile ? (
                  <Button size="sm" variant="ghost" onClick={() => setEditingProfile(true)}>
                    Edit profile
                  </Button>
                ) : undefined
              }
            >
              {editingProfile ? (
                <NannyProfileEditor
                  nanny={nanny}
                  certifications={activeCertifications}
                  onDone={() => setEditingProfile(false)}
                />
              ) : (
                <AboutSection nanny={nanny} />
              )}
            </Card>

            <Card
              className="detail-grid-wide"
              title="Skills"
              action={
                canManage && !editingSkills ? (
                  <Button size="sm" variant="ghost" onClick={() => setEditingSkills(true)}>
                    Edit skills
                  </Button>
                ) : undefined
              }
            >
              {editingSkills ? (
                <NannySkillsEditor
                  nanny={nanny}
                  skills={activeSkills}
                  onDone={() => setEditingSkills(false)}
                />
              ) : nanny.skills.length > 0 ? (
                <div className="detail-skills-list">
                  {nanny.skills.map((skill) => (
                    <Badge key={skill.id} tone={skill.isActive ? 'neutral' : 'warning'}>
                      {skill.isActive ? skill.name : `${skill.name} · inactive`}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="table-subtext">No skills assigned yet.</p>
              )}
            </Card>
          </div>
        </>
      )}

      {rejecting && nanny && (
        <PromptDialog
          title="Reject application"
          message={`Reject ${nanny.name}'s application?`}
          label="Reason (optional — shown to the nanny)"
          placeholder="e.g. Couldn’t verify ID documents"
          confirmLabel="Reject application"
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

function AboutSection({ nanny }: { nanny: AdminNannyDetail }) {
  const days = workingDays(nanny.schedule);
  return (
    <div className="nanny-about">
      {nanny.bio ? (
        <p className="nanny-about-bio">{nanny.bio}</p>
      ) : (
        <p className="table-subtext">No bio yet.</p>
      )}
      <DescriptionList
        items={[
          {
            label: 'Date of birth',
            value: nanny.dateOfBirth ? formatDate(nanny.dateOfBirth) : DASH,
          },
          {
            label: 'Experience',
            value:
              nanny.yearsOfExperience === null
                ? DASH
                : `${nanny.yearsOfExperience} ${nanny.yearsOfExperience === 1 ? 'year' : 'years'}`,
          },
          { label: 'Availability', value: availabilityLabel(nanny.availabilityType) },
          {
            label: 'Age ranges',
            value:
              nanny.ageRanges.length > 0 ? (
                <div className="detail-skills-list">
                  {nanny.ageRanges.map((range) => (
                    <Badge key={range}>{range}</Badge>
                  ))}
                </div>
              ) : (
                DASH
              ),
          },
          {
            label: 'Certifications',
            value:
              nanny.certifications.length > 0 ? (
                <div className="detail-skills-list">
                  {nanny.certifications.map((c) => (
                    <Badge key={c.id}>{c.name}</Badge>
                  ))}
                </div>
              ) : (
                DASH
              ),
          },
          {
            label: 'Working hours',
            wide: true,
            value: days ? (
              <ul className="nanny-hours">
                {days.map(({ day, hours }) => (
                  <li key={day} className={hours ? undefined : 'nanny-hours-off'}>
                    <span className="nanny-hours-day">{day.slice(0, 3)}</span>
                    <span>{hours ?? 'Off'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              DASH
            ),
          },
        ]}
      />
    </div>
  );
}
