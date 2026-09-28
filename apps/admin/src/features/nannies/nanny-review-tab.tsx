import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ADMIN_PAGE_SIZES,
  type AdminNanny,
  type AdminApprovalStatusFilter,
  type AdminNannySortKey,
} from '@nanny-app/shared';

import {
  Badge,
  type Column,
  idColumn,
  ErrorState,
  FilterSelect,
  Pagination,
  StaleRefreshBanner,
  Table,
  TableSkeleton,
} from '@admin/components/ui';
import { fetchNannies } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { approvalStatusLabel, approvalStatusTone } from '@admin/lib/approval-status';
import { usePagination } from '@admin/lib/use-pagination';
import { useTableSort } from '@admin/lib/use-table-sort';

const STATUS_FILTERS: { value: AdminApprovalStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING_REVIEW', label: 'Pending review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'PENDING_ID', label: 'Awaiting ID' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

const EMPTY = <span className="table-empty">—</span>;

/**
 * The nanny directory. Opens on every status, so the tab is never an empty
 * table while the review queue is clear. Newest registrations first by default
 * — a directory is read from the most recent — and re-sorted by clicking a
 * column header.
 */
export function NannyReviewTab() {
  const [status, setStatus] = useState<AdminApprovalStatusFilter>('ALL');
  const { page, limit, setPage, setLimit, reset } = usePagination();
  const { sort, onSortChange } = useTableSort<AdminNannySortKey>(
    { sortBy: 'registered', sortDir: 'desc' },
    reset,
  );
  const navigate = useNavigate();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-nannies', status, sort, page, limit],
    queryFn: () => fetchNannies(status, { page, limit, ...sort }),
  });
  const nannies = data?.data;
  const meta = data?.meta;

  function changeStatus(next: AdminApprovalStatusFilter) {
    setStatus(next);
    reset();
  }

  const columns: Column<AdminNanny, AdminNannySortKey>[] = [
    idColumn((row) => row.id, 'id'),
    {
      key: 'nanny',
      header: 'Nanny',
      sortKey: 'name',
      render: (nanny) => <span className="nanny-name">{nanny.name}</span>,
    },
    {
      key: 'phone',
      header: 'Phone number',
      nowrap: true,
      render: (nanny) => nanny.phone ?? EMPTY,
    },
    { key: 'email', header: 'Email', sortKey: 'email', render: (nanny) => nanny.email },
    {
      key: 'camera',
      header: 'Camera',
      sortKey: 'camera',
      render: (nanny) =>
        nanny.camera ? nanny.camera.name : <span className="table-subtext">Not assigned</span>,
    },
    {
      key: 'registered',
      header: 'Registered',
      sortKey: 'registered',
      sortFirst: 'desc',
      nowrap: true,
      render: (nanny) => formatDate(nanny.createdAt),
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (nanny) => (
        <>
          <Badge tone={approvalStatusTone(nanny.approvalStatus)}>
            {approvalStatusLabel(nanny.approvalStatus)}
          </Badge>
          {nanny.rejectionReason && <div className="table-subtext">{nanny.rejectionReason}</div>}
        </>
      ),
    },
  ];

  return (
    <>
      <p className="panel-lead">
        New nanny registrations wait here until reviewed. Open a nanny to check her profile and ID
        together, edit anything that needs correcting, then approve or reject the application.
      </p>
      <div className="filter-bar">
        <FilterSelect
          label="Status"
          value={status}
          options={STATUS_FILTERS}
          onChange={(value) => changeStatus(value as AdminApprovalStatusFilter)}
        />
      </div>
      {isLoading && <TableSkeleton columns={7} />}
      {error != null && !nannies && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {nannies && (
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
            rows={nannies}
            rowKey={(nanny) => nanny.id}
            empty="No nannies with this status."
            onRowClick={(nanny) => navigate(`/users/nannies/${nanny.id}`)}
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
              label="nannies"
            />
          )}
        </>
      )}
    </>
  );
}
