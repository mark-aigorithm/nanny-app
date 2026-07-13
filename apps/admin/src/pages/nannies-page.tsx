import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { AdminNanny, AdminNannyStatusFilter } from '@nanny-app/shared';

import {
  ActionMenu,
  Badge,
  Ban,
  Check,
  type Column,
  ErrorState,
  Eye,
  FilterSelect,
  ICON_SIZE,
  MenuItem,
  MenuSeparator,
  Modal,
  PageHeader,
  PromptDialog,
  Table,
  TableSkeleton,
  Tags,
  useToast,
} from '@admin/components/ui';
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
  const [rejecting, setRejecting] = useState<AdminNanny | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();

  const {
    data: nannies,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['admin-nannies', status],
    queryFn: () => fetchNannies(status),
  });

  const { data: allSkills } = useQuery({ queryKey: ['skills'], queryFn: fetchSkills });
  const activeSkills = (allSkills ?? []).filter((s) => s.isActive);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin-nannies'] });

  const approveMutation = useMutation({
    mutationFn: approveNanny,
    onSuccess: (nanny) => {
      invalidate();
      toast.success('Nanny approved', nanny.name);
    },
    onError: (err) => toast.error('Couldn’t approve nanny', apiErrorMessage(err)),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => rejectNanny(id, reason),
    onSuccess: () => {
      invalidate();
      setRejecting(null);
      toast.success('Nanny rejected');
    },
    onError: (err) => toast.error('Couldn’t reject nanny', apiErrorMessage(err)),
  });

  const mutating = approveMutation.isPending || rejectMutation.isPending;

  const columns: Column<AdminNanny>[] = [
    {
      key: 'nanny',
      header: 'Nanny',
      render: (nanny) => (
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
      ),
    },
    {
      key: 'phone',
      header: 'Phone number',
      nowrap: true,
      render: (nanny) => (
        <>
          {nanny.phone ?? EMPTY}
          {(nanny.isEmailVerified || nanny.isPhoneVerified) && (
            <div className="table-subtext">
              {[nanny.isEmailVerified ? 'email' : null, nanny.isPhoneVerified ? 'phone' : null]
                .filter(Boolean)
                .join(' & ')}{' '}
              verified
            </div>
          )}
        </>
      ),
    },
    { key: 'location', header: 'Location', render: (nanny) => nanny.location ?? EMPTY },
    {
      key: 'experience',
      header: 'Experience',
      render: (nanny) => (
        <>
          {nanny.yearsOfExperience !== null ? `${nanny.yearsOfExperience} yrs` : EMPTY}
          {nanny.certifications.length > 0 && (
            <div className="table-subtext">{nanny.certifications.join(', ')}</div>
          )}
        </>
      ),
    },
    {
      key: 'rate',
      header: 'Rate (EGP/h)',
      align: 'right',
      render: (nanny) => (nanny.hourlyRate !== null ? nanny.hourlyRate.toFixed(2) : EMPTY),
    },
    {
      key: 'skills',
      header: 'Skills',
      render: (nanny) =>
        nanny.skills.length > 0 ? (
          <div className="skill-chips">
            {nanny.skills.map((skill) => (
              <Badge key={skill.id} tone="neutral">
                {skill.name}
              </Badge>
            ))}
          </div>
        ) : (
          EMPTY
        ),
    },
    {
      key: 'registered',
      header: 'Registered',
      nowrap: true,
      render: (nanny) => formatDate(nanny.createdAt),
    },
    {
      key: 'status',
      header: 'Status',
      render: (nanny) => (
        <>
          <Badge tone={statusTone(nanny.approvalStatus)}>{statusLabel(nanny.approvalStatus)}</Badge>
          {nanny.rejectionReason && <div className="table-subtext">{nanny.rejectionReason}</div>}
        </>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (nanny) => {
        const hasId = Boolean(nanny.idDocumentFrontUrl || nanny.idDocumentBackUrl);
        return (
          <ActionMenu label={`Actions for ${nanny.name}`} disabled={mutating}>
            {nanny.approvalStatus !== 'APPROVED' && (
              <MenuItem
                icon={<Check size={ICON_SIZE.menu} />}
                onSelect={() => approveMutation.mutate(nanny.id)}
              >
                Approve
              </MenuItem>
            )}
            <MenuItem
              icon={<Tags size={ICON_SIZE.menu} />}
              onSelect={() => setEditingSkillsId((id) => (id === nanny.id ? null : nanny.id))}
            >
              {editingSkillsId === nanny.id ? 'Close skills' : 'Edit skills'}
            </MenuItem>
            {hasId && (
              <MenuItem icon={<Eye size={ICON_SIZE.menu} />} onSelect={() => setIdViewNanny(nanny)}>
                View ID
              </MenuItem>
            )}
            {nanny.approvalStatus === 'PENDING_REVIEW' && (
              <>
                <MenuSeparator />
                <MenuItem
                  danger
                  icon={<Ban size={ICON_SIZE.menu} />}
                  onSelect={() => setRejecting(nanny)}
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
        title="New Nannies"
        subtitle="New nanny registrations wait here until reviewed — contact them for KYC, then approve or reject. Approving notifies the nanny and lets her into the app."
      />
      <div className="filter-bar">
        <FilterSelect
          label="Status"
          value={status}
          options={STATUS_FILTERS}
          onChange={(value) => setStatus(value as AdminNannyStatusFilter)}
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
      {nannies && (
        <Table
          wrap
          columns={columns}
          rows={nannies}
          rowKey={(nanny) => nanny.id}
          empty="No nannies with this status."
          renderExpanded={(nanny) =>
            editingSkillsId === nanny.id ? (
              <NannySkillsEditor
                nanny={nanny}
                skills={activeSkills}
                onDone={() => setEditingSkillsId(null)}
              />
            ) : null
          }
        />
      )}

      {rejecting && (
        <PromptDialog
          title="Reject application"
          message={`Reject ${rejecting.name}'s application?`}
          label="Reason (optional — shown to the nanny)"
          placeholder="e.g. Couldn’t verify ID documents"
          confirmLabel="Reject nanny"
          danger
          multiline
          busy={rejectMutation.isPending}
          onSubmit={(reason) => rejectMutation.mutate({ id: rejecting.id, reason: reason || undefined })}
          onCancel={() => setRejecting(null)}
        />
      )}

      {idViewNanny && <IdDocumentModal nanny={idViewNanny} onClose={() => setIdViewNanny(null)} />}
    </section>
  );
}

function IdDocumentModal({ nanny, onClose }: { nanny: AdminNanny; onClose: () => void }) {
  return (
    <Modal title={`${nanny.name}'s ID`} onClose={onClose}>
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
    </Modal>
  );
}
