import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  ADMIN_PAGE_SIZES,
  type AdminCommunityStatusFilter,
  type AdminCommunityTypeFilter,
} from '@nanny-app/shared';

import {
  ErrorState,
  FilterSelect,
  PageHeader,
  Pagination,
  StaleRefreshBanner,
  TableSkeleton,
} from '@admin/components/ui';
import { PostTable } from '@admin/features/community/post-table';
import { OfficialListingForm } from '@admin/features/marketplace/official-listing-form';
import { fetchCommunityPosts } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';
import { usePagination } from '@admin/lib/use-pagination';

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

export function CommunityPage() {
  const canManage = useCanManage('marketplace');
  const [type, setType] = useState<AdminCommunityTypeFilter>('ALL');
  const [status, setStatus] = useState<AdminCommunityStatusFilter>('PENDING');
  const { page, limit, setPage, setLimit, reset } = usePagination();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['community-posts', type, status, page, limit],
    queryFn: () => fetchCommunityPosts(type, status, { page, limit }),
  });
  const posts = data?.data;
  const meta = data?.meta;

  return (
    <section>
      <PageHeader
        title="Community"
        subtitle="Review what mothers post — questions, events and listings — before it reaches the feed, and publish official listings of your own."
      />

      {canManage && <OfficialListingForm />}

      <p className="panel-lead">
        New and edited posts wait here until you approve them. Rejecting one sends the author
        the reason so she can fix it and resubmit — and takes a live post straight out of the
        feed.
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
            setStatus(value as AdminCommunityStatusFilter);
            reset();
          }}
        />
      </div>

      {isLoading && <TableSkeleton columns={7} />}
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
          <PostTable posts={posts} />
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
    </section>
  );
}
