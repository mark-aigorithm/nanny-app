import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { ADMIN_PAGE_SIZES, type AdminPackagePurchase } from '@nanny-app/shared';

import {
  ErrorState,
  FilterSelect,
  Input,
  PageHeader,
  Pagination,
  TableSkeleton,
} from '@admin/components/ui';
import { PurchaseLedgerDrawer } from '@admin/features/package-purchases/purchase-ledger-drawer';
import { PurchaseTable } from '@admin/features/package-purchases/purchase-table';
import { fetchPackagePurchases } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { usePagination } from '@admin/lib/use-pagination';

type StatusFilter = 'ALL' | AdminPackagePurchase['status'];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING_PAYMENT', label: 'Pending payment' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'REFUNDED', label: 'Refunded' },
];

export function PackagePurchasesPage() {
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  // Server-side search, debounced so we don't refetch on every keystroke.
  const [appliedSearch, setAppliedSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { page, limit, setPage, setLimit, reset } = usePagination();

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(search.trim());
      setPage(1); // A new search starts from the first page.
    }, 300);
    return () => clearTimeout(timer);
  }, [search, setPage]);

  function changeStatus(next: StatusFilter) {
    setStatus(next);
    reset();
  }

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['package-purchases', page, limit, status, appliedSearch],
    queryFn: () =>
      fetchPackagePurchases({
        page,
        limit,
        status: status === 'ALL' ? undefined : status,
        search: appliedSearch || undefined,
      }),
  });
  const purchases = data?.data;
  const meta = data?.meta;

  return (
    <section>
      <PageHeader
        title="Package Purchases"
        subtitle="Every prepaid hours bundle a parent has bought — remaining balance, consumption, and the full redemption ledger behind each one."
      />

      <div className="filter-bar">
        <FilterSelect
          label="Status"
          value={status}
          options={STATUS_FILTERS}
          onChange={(value) => changeStatus(value as StatusFilter)}
        />
        <Input
          type="search"
          placeholder="Search by buyer name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search package purchases"
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
      {purchases && <PurchaseTable rows={purchases} onRowClick={setSelectedId} />}
      {purchases && meta && (
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          limit={meta.limit}
          onPageChange={setPage}
          limitOptions={ADMIN_PAGE_SIZES}
          onLimitChange={setLimit}
          label="purchases"
        />
      )}

      {selectedId != null && (
        <PurchaseLedgerDrawer id={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </section>
  );
}
