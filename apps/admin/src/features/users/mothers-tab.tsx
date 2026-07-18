import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { ADMIN_PAGE_SIZES, type AdminMother } from '@nanny-app/shared';

import {
  Badge,
  type Column,
  ErrorState,
  Pagination,
  Table,
  TableSkeleton,
} from '@admin/components/ui';
import { fetchMothers } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { usePagination } from '@admin/lib/use-pagination';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

const EMPTY = <span className="table-empty">—</span>;

export function MothersTab() {
  const { page, limit, setPage, setLimit } = usePagination();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-mothers', page, limit],
    queryFn: () => fetchMothers({ page, limit }),
  });
  const mothers = data?.data;
  const meta = data?.meta;

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
    { key: 'email', header: 'Email', render: (mother) => mother.email },
    {
      key: 'status',
      header: 'Status',
      render: (mother) => (
        <Badge tone={mother.isActive ? 'success' : 'neutral'}>
          {mother.isActive ? 'Active' : 'Deactivated'}
        </Badge>
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
        Every parent who has signed up. Registrations appear here automatically — no review needed.
      </p>
      {isLoading && <TableSkeleton columns={6} />}
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
          empty="No mommies have signed up yet."
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
