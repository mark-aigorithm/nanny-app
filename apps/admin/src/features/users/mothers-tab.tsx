import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ADMIN_PAGE_SIZES,
  type AdminMother,
  type AdminApprovalStatusFilter,
  type AdminUserSortKey,
} from '@nanny-app/shared';

import {
  Badge,
  type Column,
  ErrorState,
  FilterSelect,
  Pagination,
  StaleRefreshBanner,
  Table,
  TableSkeleton,
} from '@admin/components/ui';
import { fetchMothers } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { usePagination } from '@admin/lib/use-pagination';
import { useTableSort } from '@admin/lib/use-table-sort';

const STATUS_FILTERS: { value: AdminApprovalStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING_ID', label: 'Awaiting ID' },
  { value: 'PENDING_REVIEW', label: 'Pending review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

const EMPTY = <span className="table-empty">—</span>;

/**
 * The parent directory. Newest sign-ups first by default — a directory is read
 * from the most recent — and re-sorted by clicking a column header.
 */
export function MothersTab() {
  const [status, setStatus] = useState<AdminApprovalStatusFilter>('ALL');
  const { page, limit, setPage, setLimit, reset } = usePagination();
  const { sort, onSortChange } = useTableSort<AdminUserSortKey>(
    { sortBy: 'registered', sortDir: 'desc' },
    reset,
  );
  const navigate = useNavigate();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-mothers', status, sort, page, limit],
    queryFn: () => fetchMothers(status, { page, limit, ...sort }),
  });
  const mothers = data?.data;
  const meta = data?.meta;

  function changeStatus(next: AdminApprovalStatusFilter) {
    setStatus(next);
    reset();
  }

  const columns: Column<AdminMother, AdminUserSortKey>[] = [
    {
      key: 'mother',
      header: 'Mommy',
      sortKey: 'name',
      render: (mother) => <span className="nanny-name">{mother.name}</span>,
    },
    {
      key: 'phone',
      header: 'Phone number',
      nowrap: true,
      render: (mother) => mother.phone ?? EMPTY,
    },
    { key: 'email', header: 'Email', sortKey: 'email', render: (mother) => mother.email },
    {
      key: 'registered',
      header: 'Registered',
      sortKey: 'registered',
      sortFirst: 'desc',
      nowrap: true,
      render: (mother) => formatDate(mother.createdAt),
    },
    {
      key: 'active',
      header: 'Status',
      sortKey: 'status',
      render: (mother) => (
        <Badge tone={mother.isActive ? 'success' : 'neutral'}>
          {mother.isActive ? 'Active' : 'Deactivated'}
        </Badge>
      ),
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
          onChange={(value) => changeStatus(value as AdminApprovalStatusFilter)}
        />
      </div>
      {isLoading && <TableSkeleton columns={5} />}
      {error != null && !mothers && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {mothers && (
        <>
          {error != null && (
            <StaleRefreshBanner
              message={apiErrorMessage(error)}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}
          <Table
            wrap
            columns={columns}
            rows={mothers}
            rowKey={(mother) => mother.id}
            empty="No mommies with this status."
            onRowClick={(mother) => navigate(`/users/mothers/${mother.id}`)}
            sort={sort}
            onSortChange={onSortChange}
          />
          {meta && (
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
      )}
    </>
  );
}
