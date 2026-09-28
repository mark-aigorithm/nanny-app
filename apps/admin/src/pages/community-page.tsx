import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  ADMIN_PAGE_SIZES,
  type AdminCommunitySortKey,
  type AdminCommunityStatusFilter,
  type AdminCommunityTypeFilter,
} from '@nanny-app/shared';

import {
  Button,
  ErrorState,
  FilterSelect,
  ICON_SIZE,
  PageHeader,
  Pagination,
  Plus,
  StaleRefreshBanner,
  type TableSort,
  TableSkeleton,
} from '@admin/components/ui';
import { PostTable } from '@admin/features/community/post-table';
import { OfficialListingFormModal } from '@admin/features/marketplace/official-listing-form';
import { fetchCommunityPosts } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';
import { usePagination } from '@admin/lib/use-pagination';
import { useTableSort } from '@admin/lib/use-table-sort';

const TYPE_FILTERS: { value: AdminCommunityTypeFilter; label: string }[] = [
  { value: 'ALL', label: 'All types' },
  { value: 'MARKETPLACE', label: 'Marketplace' },
  { value: 'QA', label: 'Q&A' },
  { value: 'EVENT', label: 'Events' },
];

const STATUS_FILTERS: { value: AdminCommunityStatusFilter; label: string }[] = [
  { value: 'PENDING', label: 'Pending review' },
  { value: 'APPROVED', label: 'Live' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ALL', label: 'All' },
];

/**
 * Where each queue starts: the pending queue is a work queue, so the longest
 * wait is served first; every other view reads newest first.
 */
function defaultSort(status: AdminCommunityStatusFilter): TableSort<AdminCommunitySortKey> {
  return { sortBy: 'submitted', sortDir: status === 'PENDING' ? 'asc' : 'desc' };
}

export function CommunityPage() {
  const canManage = useCanManage('marketplace');
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<AdminCommunityTypeFilter>('ALL');
  const [status, setStatus] = useState<AdminCommunityStatusFilter>('PENDING');
  const { page, limit, setPage, setLimit, reset } = usePagination();
  const { sort, onSortChange } = useTableSort<AdminCommunitySortKey>(defaultSort('PENDING'), reset);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['community-posts', type, status, sort, page, limit],
    queryFn: () => fetchCommunityPosts(type, status, { page, limit, ...sort }),
  });
  const posts = data?.data;
  const meta = data?.meta;

  return (
    <section>
      <PageHeader
        title="Community"
        subtitle="Review what mothers post — questions, events and listings — before it reaches the feed, and publish official listings of your own."
        action={
          canManage && (
            <Button onClick={() => setAdding(true)}>
              <Plus size={ICON_SIZE.inline} aria-hidden />
              Add official listing
            </Button>
          )
        }
      />

      <p className="panel-lead">
        New and edited posts wait here until you approve them. Rejecting one sends the author the
        reason so she can fix it and resubmit — and takes a live post straight out of the feed.
      </p>

      <div className="filter-bar">
        <FilterSelect
          label="Type"
          value={type}
          options={TYPE_FILTERS}
          onChange={(value) => {
            setType(value as AdminCommunityTypeFilter);
            reset();
          }}
        />
        <FilterSelect
          label="Status"
          value={status}
          options={STATUS_FILTERS}
          onChange={(value) => {
            const next = value as AdminCommunityStatusFilter;
            setStatus(next);
            // Each queue opens in its own order; this also resets the page.
            onSortChange(defaultSort(next));
          }}
        />
      </div>

      {isLoading && <TableSkeleton columns={8} />}
      {error != null && !posts && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {posts && (
        <>
          {error != null && (
            <StaleRefreshBanner
              message={apiErrorMessage(error)}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}
          <PostTable posts={posts} sort={sort} onSortChange={onSortChange} />
          {meta && (
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              limit={meta.limit}
              limitOptions={ADMIN_PAGE_SIZES}
              label="posts"
              onPageChange={setPage}
              onLimitChange={setLimit}
            />
          )}
        </>
      )}
      {adding && <OfficialListingFormModal onClose={() => setAdding(false)} />}
    </section>
  );
}
