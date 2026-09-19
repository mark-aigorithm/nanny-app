import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  ADMIN_PAGE_SIZES,
  ADMIN_SORT_OPTIONS,
  type AdminApprovalStatusFilter,
  type AdminSortOrder,
} from '@nanny-app/shared';

import {
  ErrorState,
  FilterSelect,
  Pagination,
  Skeleton,
  StaleRefreshBanner,
} from '@admin/components/ui';
import { fetchIdReviews } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { usePagination } from '@admin/lib/use-pagination';

import { IdReviewCard } from './id-review-card';

const STATUS_FILTERS: { value: AdminApprovalStatusFilter; label: string }[] = [
  { value: 'PENDING_REVIEW', label: 'Pending review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'PENDING_ID', label: 'Awaiting ID' },
  { value: 'ALL', label: 'All' },
];

/**
 * Parent ID-review gallery: every ID a parent has uploaded as a card, filterable
 * by status, with Approve/Reject on each pending card so an admin can clear the
 * queue without opening each parent's detail page. Nannies are not here — their
 * ID is reviewed on the Nannies tab as part of approving the application.
 *
 * Opens oldest-first because it is a work queue — whoever has been waiting
 * longest is offered first — which is the opposite of the Mommies and Nannies
 * tabs beside it. The Sort control is what keeps that from being a surprise:
 * both directions are on screen and switchable on every tab.
 */
export function IdReviewTab() {
  const [status, setStatus] = useState<AdminApprovalStatusFilter>('PENDING_REVIEW');
  const [sort, setSort] = useState<AdminSortOrder>('oldest');
  const { page, limit, setPage, setLimit, reset } = usePagination();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-id-reviews', status, sort, page, limit],
    queryFn: () => fetchIdReviews(status, { page, limit, sort }),
  });
  const reviews = data?.data;
  const meta = data?.meta;

  return (
    <>
      <p className="panel-lead">
        Every ID a parent has uploaded, in one place. Scan the photos, then approve or reject
        without leaving the page. Nannies are reviewed from the Nannies tab, where their profile
        and ID are decided together.
      </p>
      <div className="filter-bar">
        <FilterSelect
          label="Status"
          value={status}
          options={STATUS_FILTERS}
          onChange={(value) => {
            setStatus(value as AdminApprovalStatusFilter);
            reset();
          }}
        />
        <FilterSelect
          label="Sort"
          value={sort}
          options={ADMIN_SORT_OPTIONS}
          onChange={(value) => {
            setSort(value as AdminSortOrder);
            reset();
          }}
        />
      </div>

      {isLoading && <IdReviewGridSkeleton />}
      {error != null && !reviews && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {reviews && (
        <>
          {error != null && (
            <StaleRefreshBanner
              message={apiErrorMessage(error)}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}
          {reviews.length === 0 ? (
            <div className="id-review-empty">Nothing to review here — this queue is all caught up.</div>
          ) : (
            <div className="id-review-grid">
              {reviews.map((review) => (
                <IdReviewCard key={review.id} review={review} />
              ))}
            </div>
          )}
          {meta && (
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              limit={meta.limit}
              onPageChange={setPage}
              limitOptions={ADMIN_PAGE_SIZES}
              onLimitChange={setLimit}
              label="IDs"
            />
          )}
        </>
      )}
    </>
  );
}

/** Placeholder grid shown while the first page of IDs loads. */
function IdReviewGridSkeleton() {
  return (
    <div className="id-review-grid" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={`id-review-skeleton-${i}`} className="id-review-card">
          <div className="id-review-card-head">
            <Skeleton width={40} height={40} radius="var(--radius-full)" />
            <div className="id-review-skeleton-lines">
              <Skeleton width="60%" height={14} />
              <Skeleton width="40%" height={12} />
            </div>
          </div>
          <Skeleton height={150} radius="var(--radius-md)" />
          <Skeleton width="55%" height={32} radius="var(--radius-full)" />
        </div>
      ))}
    </div>
  );
}
