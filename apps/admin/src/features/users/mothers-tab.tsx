import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ADMIN_PAGE_SIZES,
  type AdminMother,
  type AdminMotherStatusFilter,
} from '@nanny-app/shared';

import {
  Badge,
  type Column,
  ErrorState,
  FilterSelect,
  Pagination,
  Table,
  TableSkeleton,
} from '@admin/components/ui';
import { fetchMothers } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { usePagination } from '@admin/lib/use-pagination';

const STATUS_FILTERS: { value: AdminMotherStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING_ID', label: 'Awaiting ID' },
  { value: 'PENDING_REVIEW', label: 'Pending review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function statusTone(
  status: AdminMother['idVerificationStatus'],
): 'success' | 'danger' | 'neutral' {
  if (status === 'APPROVED') return 'success';
  if (status === 'REJECTED') return 'danger';
  return 'neutral';
}

function statusLabel(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase();
}

const EMPTY = <span className="table-empty">—</span>;

export function MothersTab() {
  const [status, setStatus] = useState<AdminMotherStatusFilter>('ALL');
  const { page, limit, setPage, setLimit, reset } = usePagination();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-mothers', status, page, limit],
    queryFn: () => fetchMothers(status, { page, limit }),
  });
  const mothers = data?.data;
  const meta = data?.meta;

  function changeStatus(next: AdminMotherStatusFilter) {
    setStatus(next);
    reset();
  }

  const columns: Column<AdminMother>[] = [
    {
      key: 'mother',
      header: 'Mommy',
      render: (mother) => <span className="nanny-name">{mother.name}</span>,
    },
    {
      key: 'phone',
      header: 'Phone number',
      nowrap: true,
      render: (mother) => (
        <>
          {mother.phone ?? EMPTY}
          {(mother.isEmailVerified || mother.isPhoneVerified) && (
            <div className="table-subtext">
              {[mother.isEmailVerified ? 'email' : null, mother.isPhoneVerified ? 'phone' : null]
                .filter(Boolean)
                .join(' & ')}{' '}
              verified
            </div>
          )}
        </>
      ),
    },
    { key: 'location', header: 'Location', render: (mother) => mother.location ?? EMPTY },
    { key: 'email', header: 'Email', render: (mother) => mother.email },
    {
      key: 'active',
      header: 'Status',
      render: (mother) => (
        <Badge tone={mother.isActive ? 'success' : 'neutral'}>
          {mother.isActive ? 'Active' : 'Deactivated'}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'ID status',
      render: (mother) =>
        mother.idVerificationStatus ? (
          <>
            <Badge tone={statusTone(mother.idVerificationStatus)}>
              {statusLabel(mother.idVerificationStatus)}
            </Badge>
            {mother.rejectionReason && (
              <div className="table-subtext">{mother.rejectionReason}</div>
            )}
          </>
        ) : (
          EMPTY
        ),
    },
    {
      key: 'bookings',
      header: 'Bookings',
      align: 'right',
      render: (mother) =>
        mother.bookingCount > 0 ? (
          <Badge tone="neutral">{mother.bookingCount}</Badge>
        ) : (
          EMPTY
        ),
    },
    {
      key: 'registered',
      header: 'Registered',
      nowrap: true,
      render: (mother) => formatDate(mother.createdAt),
    },
  ];

  return (
    <>
      <p className="panel-lead">
        Every parent who has signed up. Open a mommy to review the ID she uploaded before booking,
        and approve or reject it.
      </p>
      <div className="filter-bar">
        <FilterSelect
          label="ID status"
          value={status}
          options={STATUS_FILTERS}
          onChange={(value) => changeStatus(value as AdminMotherStatusFilter)}
        />
      </div>
      {isLoading && <TableSkeleton columns={8} />}
      {error != null && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {mothers && (
        <Table
          wrap
          columns={columns}
          rows={mothers}
          rowKey={(mother) => mother.id}
          empty="No mommies with this status."
          onRowClick={(mother) => navigate(`/users/mothers/${mother.id}`)}
        />
      )}
      {mothers && meta && (
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          limit={meta.limit}
          onPageChange={setPage}
          limitOptions={ADMIN_PAGE_SIZES}
          onLimitChange={setLimit}
          label="mommies"
        />
      )}
    </>
  );
}
