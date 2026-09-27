import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { idTypeRequiresBack, type AdminNannyDetail, type IdDocumentType } from '@nanny-app/shared';

import {
  Badge,
  Briefcase,
  Button,
  Card,
  CircleCheck,
  CircleOff,
  ClipboardList,
  DescriptionList,
  DetailHeader,
  ErrorState,
  ICON_SIZE,
  LoadingState,
  Mail,
  MapPin,
  Phone,
  PromptDialog,
  StaleRefreshBanner,
  StatCard,
  useToast,
  Wallet,
} from '@admin/components/ui';
import { IdDocumentModal } from '@admin/features/nannies/id-document-modal';
import { NannyAddressCard } from '@admin/features/nannies/nanny-address-card';
import {
  NannyProfileEditor,
  availabilityLabel,
  workingDays,
} from '@admin/features/nannies/nanny-profile-editor';
import { NannySkillsEditor } from '@admin/features/nannies/nanny-skills-editor';
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
import { formatEgp, initials } from '@admin/lib/format';
import { useCanManage } from '@admin/lib/permissions';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

const DASH = <span className="table-empty">—</span>;

const ID_TYPE_LABEL: Record<IdDocumentType, string> = {
  PASSPORT: 'Passport',
  NATIONAL_ID: 'National ID',
};

export function NannyDetailPage() {
  const canManage = useCanManage('users');
  const { id = '' } = useParams();
  const [rejecting, setRejecting] = useState(false);
  const [editingSkills, setEditingSkills] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
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
          <Button
            size="sm"
            disabled={mutating}
            onClick={() => approveMutation.mutate()}
          >
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

          <NannySummary nanny={nanny} />

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
            <StatCard
              label="Experience"
              value={nanny.yearsOfExperience !== null ? `${nanny.yearsOfExperience} yrs` : '—'}
              icon={<Briefcase size={ICON_SIZE.stat} aria-hidden />}
              iconTone="bronze"
            />
          </div>

          <div className="detail-columns">
            <div className="detail-column">
              <Card
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

            <div className="detail-column">
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
                      value: <IdPhotos nanny={nanny} onOpen={() => setIdOpen(true)} />,
                    },
                  ]}
                />
              </Card>

              <NannyAddressCard nanny={nanny} canManage={canManage} />
            </div>
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

/**
 * Who she is at a glance: photo, status, verification and how to reach her.
 * The cards below hold the detail an admin opens the record to check.
 */
function NannySummary({ nanny }: { nanny: AdminNannyDetail }) {
  return (
    <Card className="nanny-summary">
      {nanny.avatarUrl ? (
        <img className="nanny-summary-avatar" src={nanny.avatarUrl} alt="" />
      ) : (
        <span className="nanny-summary-avatar nanny-summary-avatar--fallback" aria-hidden>
          {initials(nanny.name)}
        </span>
      )}
      <div className="nanny-summary-body">
        <div className="nanny-summary-badges">
          <Badge tone={approvalStatusTone(nanny.approvalStatus)}>
            {approvalStatusLabel(nanny.approvalStatus)}
          </Badge>
          <VerifiedBadge label="Email" verified={nanny.isEmailVerified} />
          <VerifiedBadge label="Phone" verified={nanny.isPhoneVerified} />
        </div>
        <ul className="nanny-summary-contact">
          <li>
            <Mail size={ICON_SIZE.inline} aria-label="Email" />
            {nanny.email}
          </li>
          <li>
            <Phone size={ICON_SIZE.inline} aria-label="Phone" />
            {nanny.phone ?? DASH}
          </li>
          <li>
            <MapPin size={ICON_SIZE.inline} aria-label="Location" />
            {nanny.location ?? DASH}
          </li>
        </ul>
      </div>
    </Card>
  );
}

/**
 * Her ID, front and back, right where the application is decided. Clicking
 * opens the full-size viewer. A passport has no back side.
 */
function IdPhotos({ nanny, onOpen }: { nanny: AdminNannyDetail; onOpen: () => void }) {
  if (!nanny.idDocumentFrontUrl && !nanny.idDocumentBackUrl) {
    return <p className="table-subtext">No ID uploaded yet.</p>;
  }
  const showBack = nanny.idDocumentType == null || idTypeRequiresBack(nanny.idDocumentType);
  return (
    <button
      type="button"
      className="id-review-thumbs nanny-id-photos"
      onClick={onOpen}
      title="Click to enlarge"
    >
      <span className="id-review-thumb">
        {nanny.idDocumentFrontUrl ? (
          <img src={nanny.idDocumentFrontUrl} alt={`Front of ${nanny.name}'s ID`} />
        ) : (
          <span className="id-review-thumb-empty">No front image</span>
        )}
        <span className="id-review-thumb-tag">Front</span>
      </span>
      {showBack && (
        <span className="id-review-thumb">
          {nanny.idDocumentBackUrl ? (
            <img src={nanny.idDocumentBackUrl} alt={`Back of ${nanny.name}'s ID`} />
          ) : (
            <span className="id-review-thumb-empty">No back image</span>
          )}
          <span className="id-review-thumb-tag">Back</span>
        </span>
      )}
    </button>
  );
}

function VerifiedBadge({ label, verified }: { label: string; verified: boolean }) {
  const Icon = verified ? CircleCheck : CircleOff;
  return (
    <Badge tone={verified ? 'success' : 'neutral'}>
      <span className="badge-with-icon">
        <Icon size={12} aria-hidden />
        {label} {verified ? 'verified' : 'not verified'}
      </span>
    </Badge>
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
