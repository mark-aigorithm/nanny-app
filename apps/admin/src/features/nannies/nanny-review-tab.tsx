import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ADMIN_PAGE_SIZES, type AdminNanny, type AdminNannyStatusFilter } from '@nanny-app/shared';

import {
  Badge,
  type Column,
  ErrorState,
  FilterSelect,
  Pagination,
  Table,
  TableSkeleton,
} from '@admin/components/ui';
import { fetchNannies } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { usePagination } from '@admin/lib/use-pagination';

const STATUS_FILTERS: { value: AdminNannyStatusFilter; label: string }[] = [
  { value: 'PENDING_REVIEW', label: 'Pending review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'PENDING_ID', label: 'Awaiting ID' },
  { value: 'ALL', label: 'All' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function statusTone(status: AdminNanny['idVerificationStatus']): 'success' | 'danger' | 'neutral' {
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

export function NannyReviewTab() {
  const [status, setStatus] = useState<AdminNannyStatusFilter>('PENDING_REVIEW');
  const { page, limit, setPage, setLimit, reset } = usePagination();
  const navigate = useNavigate();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-nannies', status, page, limit],
    queryFn: () => fetchNannies(status, { page, limit }),
  });
  const nannies = data?.data;
  const meta = data?.meta;

  function changeStatus(next: AdminNannyStatusFilter) {
    setStatus(next);
    reset();
  }

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
          <Badge tone={statusTone(nanny.idVerificationStatus)}>
            {statusLabel(nanny.idVerificationStatus)}
          </Badge>
          {nanny.rejectionReason && <div className="table-subtext">{nanny.rejectionReason}</div>}
        </>
      ),
    },
  ];

  return (
    <>
      <p className="panel-lead">
        New nanny registrations wait here until reviewed. Open a nanny to review her details, edit
        skills, view her ID, and approve or reject the application.
      </p>
      <div className="filter-bar">
        <FilterSelect
          label="Status"
          value={status}
          options={STATUS_FILTERS}
          onChange={(value) => changeStatus(value as AdminNannyStatusFilter)}
        />
      </div>
      {isLoading && <TableSkeleton columns={6} />}
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
          onRowClick={(nanny) => navigate(`/users/nannies/${nanny.id}`)}
        />
      )}
      {nannies && meta && (
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          limit={meta.limit}
          onPageChange={setPage}
          limitOptions={ADMIN_PAGE_SIZES}
          onLimitChange={setLimit}
          label="nannies"
        />
      )}
    </>
  );
}
