import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  ADMIN_PAGE_SIZES,
  ADMIN_SORT_OPTIONS,
  type AdminIdReviewRoleFilter,
  type AdminIdReviewStatusFilter,
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

const STATUS_FILTERS: { value: AdminIdReviewStatusFilter; label: string }[] = [
  { value: 'PENDING_REVIEW', label: 'Pending review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'PENDING_ID', label: 'Awaiting ID' },
  { value: 'ALL', label: 'All' },
];

const ROLE_FILTERS: { value: AdminIdReviewRoleFilter; label: string }[] = [
  { value: 'ALL', label: 'Everyone' },
  { value: 'MOTHER', label: 'Parents' },
  { value: 'NANNY', label: 'Nannies' },
];

/**
 * Combined ID-review gallery: every uploaded ID as a card, filterable by status
 * and role, with Approve/Reject on each pending card so an admin can clear the
 * KYC queue without opening each user's detail page.
 *
 * Opens oldest-first because it is a work queue — whoever has been waiting
 * longest is offered first — which is the opposite of the Mommies and Nannies
 * tabs beside it. The Sort control is what keeps that from being a surprise:
 * both directions are on screen and switchable on every tab.
 */
export function IdReviewTab() {
  const [status, setStatus] = useState<AdminIdReviewStatusFilter>('PENDING_REVIEW');
  const [role, setRole] = useState<AdminIdReviewRoleFilter>('ALL');
  const [sort, setSort] = useState<AdminSortOrder>('oldest');
  const { page, limit, setPage, setLimit, reset } = usePagination();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-id-reviews', status, role, sort, page, limit],
    queryFn: () => fetchIdReviews(status, role, { page, limit, sort }),
  });
  const reviews = data?.data;
  const meta = data?.meta;

  return (
    <>
      <p className="panel-lead">
        Every uploaded ID in one place. Scan the photos, then approve or reject without leaving the
        page — parents and nannies awaiting review show up here together.
      </p>
      <div className="filter-bar">
        <FilterSelect
          label="Status"
          value={status}
          options={STATUS_FILTERS}
          onChange={(value) => {
            setStatus(value as AdminIdReviewStatusFilter);
            reset();
          }}
        />
        <FilterSelect
          label="Role"
          value={role}
          options={ROLE_FILTERS}
          onChange={(value) => {
            setRole(value as AdminIdReviewRoleFilter);
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
                <IdReviewCard key={`${review.role}-${review.id}`} review={review} />
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
