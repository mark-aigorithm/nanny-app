import { ADMIN_PAGE_SIZES, type AdminSurveySummary, type SurveyStatus } from '@nanny-app/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Badge,
  type Column,
  ErrorState,
  FilterSelect,
  idColumn,
  Pagination,
  StaleRefreshBanner,
  Table,
  TableSkeleton,
} from '@admin/components/ui';
import { fetchSurveys } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { usePagination } from '@admin/lib/use-pagination';

import { SURVEY_STATUS_LABEL, SURVEY_STATUS_TONE, responseRate } from './survey-labels';

type StatusFilter = '' | SurveyStatus;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'CLOSED', label: 'Closed' },
];

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });

const COLUMNS: Column<AdminSurveySummary>[] = [
  idColumn((s) => s.id),
  { key: 'title', header: 'Title', width: '30%', render: (s) => s.title },
  {
    key: 'status',
    header: 'Status',
    render: (s) => <Badge tone={SURVEY_STATUS_TONE[s.status]}>{SURVEY_STATUS_LABEL[s.status]}</Badge>,
  },
  { key: 'recipients', header: 'Sent to', align: 'right', render: (s) => s.counts.recipients },
  { key: 'answered', header: 'Answered', align: 'right', render: (s) => s.counts.answered },
  { key: 'skipped', header: 'Skipped', align: 'right', render: (s) => s.counts.skipped },
  { key: 'pending', header: 'No response', align: 'right', render: (s) => s.counts.pending },
  { key: 'rate', header: 'Response rate', align: 'right', render: (s) => responseRate(s.counts) },
  { key: 'created', header: 'Created', nowrap: true, render: (s) => formatDate(s.createdAt) },
];

/** Paged list of surveys, filtered by status. A row opens the survey. */
export function SurveyTable() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<StatusFilter>('');
  const { page, limit, setPage, setLimit, reset } = usePagination();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['surveys', { status, page, limit }],
    queryFn: () => fetchSurveys({ status: status || undefined, page, limit }),
  });

  return (
    <>
      <div className="filter-bar">
        <FilterSelect
          label="Status"
          value={status}
          options={STATUS_OPTIONS}
          onChange={(value) => {
            setStatus(value as StatusFilter);
            reset();
          }}
        />
      </div>
      {isLoading && <TableSkeleton columns={COLUMNS.length} />}
      {error != null && !data && (
        <ErrorState message={apiErrorMessage(error)} onRetry={() => void refetch()} retrying={isFetching} />
      )}
      {data && (
        <>
          {error != null && (
            <StaleRefreshBanner
              message={apiErrorMessage(error)}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}
          <Table
            columns={COLUMNS}
            rows={data.data}
            rowKey={(s) => s.id}
            onRowClick={(s) => navigate(`/surveys/${s.id}`)}
            empty="No surveys yet. Create one to start collecting answers."
          />
          <Pagination
            page={page}
            totalPages={data.meta.totalPages}
            total={data.meta.total}
            limit={limit}
            onPageChange={setPage}
            limitOptions={ADMIN_PAGE_SIZES}
            onLimitChange={setLimit}
            label="surveys"
          />
        </>
      )}
    </>
  );
}
