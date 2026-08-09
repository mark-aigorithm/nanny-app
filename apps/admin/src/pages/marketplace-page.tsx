import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  ADMIN_PAGE_SIZES,
  type AdminMarketplaceStatusFilter,
} from '@nanny-app/shared';

import {
  ErrorState,
  FilterSelect,
  PageHeader,
  Pagination,
  StaleRefreshBanner,
  TableSkeleton,
} from '@admin/components/ui';
import { ListingTable } from '@admin/features/marketplace/listing-table';
import { OfficialListingForm } from '@admin/features/marketplace/official-listing-form';
import { fetchMarketplaceListings } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';
import { usePagination } from '@admin/lib/use-pagination';

const STATUS_FILTERS: { value: AdminMarketplaceStatusFilter; label: string }[] = [
  { value: 'PENDING', label: 'Pending review' },
  { value: 'APPROVED', label: 'Live' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ALL', label: 'All' },
];

export function MarketplacePage() {
  const canManage = useCanManage('marketplace');
  const [status, setStatus] = useState<AdminMarketplaceStatusFilter>('PENDING');
  const { page, limit, setPage, setLimit, reset } = usePagination();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['marketplace-listings', status, page, limit],
    queryFn: () => fetchMarketplaceListings(status, { page, limit }),
  });
  const listings = data?.data;
  const meta = data?.meta;

  return (
    <section>
      <PageHeader
        title="Marketplace"
        subtitle="Review what mothers list for sale before it reaches the feed, and publish official listings of your own."
      />

      {canManage && <OfficialListingForm />}

      <p className="panel-lead">
        New and edited listings wait here until you approve them. Rejecting one sends the seller
        the reason so she can fix it and resubmit — and takes a live listing straight out of
        the feed.
      </p>

      <div className="filter-bar">
        <FilterSelect
          label="Status"
          value={status}
          options={STATUS_FILTERS}
          onChange={(value) => {
            setStatus(value as AdminMarketplaceStatusFilter);
            reset();
          }}
        />
      </div>

      {isLoading && <TableSkeleton columns={6} />}
      {error != null && !listings && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {listings && (
        <>
          {error != null && (
            <StaleRefreshBanner
              message={apiErrorMessage(error)}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}
          <ListingTable listings={listings} />
          {meta && (
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              limit={meta.limit}
              limitOptions={ADMIN_PAGE_SIZES}
              label="listings"
              onPageChange={setPage}
              onLimitChange={setLimit}
            />
          )}
        </>
      )}
    </section>
  );
}
