import {
  ADMIN_PAGE_SIZES,
  type AdminSurveySortKey,
  type AdminSurveySummary,
  type SurveyStatus,
} from '@nanny-app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ActionMenu,
  actionsColumn,
  Badge,
  type Column,
  ConfirmDialog,
  Copy,
  ErrorState,
  Eye,
  Pencil,
  FilterSelect,
  ICON_SIZE,
  idColumn,
  Lock,
  MenuItem,
  MenuSeparator,
  Pagination,
  StaleRefreshBanner,
  Table,
  TableSkeleton,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { closeSurvey, deleteSurvey, duplicateSurvey, fetchSurveys } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { formatDate } from '@admin/lib/format';
import { useCanManage } from '@admin/lib/permissions';
import { usePagination } from '@admin/lib/use-pagination';
import { useTableSort } from '@admin/lib/use-table-sort';

import { SURVEY_STATUS_LABEL, SURVEY_STATUS_TONE, responseRate } from './survey-labels';

type StatusFilter = '' | SurveyStatus;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'CLOSED', label: 'Closed' },
];

const mothersWhoHavent = (n: number) => `${n} ${n === 1 ? 'mother who hasn’t' : 'mothers who haven’t'}`;

/** Paged list of surveys, filtered by status and sorted on the server. A row opens the survey. */
export function SurveyTable() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = useCanManage('surveys');
  const [status, setStatus] = useState<StatusFilter>('');
  const [closing, setClosing] = useState<AdminSurveySummary | null>(null);
  const [deleting, setDeleting] = useState<AdminSurveySummary | null>(null);
  const { page, limit, setPage, setLimit, reset } = usePagination();
  const { sort, onSortChange } = useTableSort<AdminSurveySortKey>({ sortBy: 'createdAt', sortDir: 'desc' }, reset);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['surveys', { status, page, limit, ...sort }],
    queryFn: () => fetchSurveys({ status: status || undefined, page, limit, ...sort }),
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['surveys'] });
  const duplicate = useMutation({
    mutationFn: (s: AdminSurveySummary) => duplicateSurvey(s.id),
    onSuccess: (copy) => {
      refresh();
      toast.success('Survey duplicated');
      navigate(`/surveys/${copy.id}`);
    },
    onError: (err) => toast.error('Couldn’t duplicate the survey', apiErrorMessage(err)),
  });
  const close = useMutation({
    mutationFn: (s: AdminSurveySummary) => closeSurvey(s.id),
    onSuccess: () => {
      setClosing(null);
      refresh();
      toast.success('Survey closed');
    },
    onError: (err) => {
      setClosing(null);
      toast.error('Couldn’t close the survey', apiErrorMessage(err));
    },
  });
  const remove = useMutation({
    mutationFn: (s: AdminSurveySummary) => deleteSurvey(s.id),
    onSuccess: () => {
      setDeleting(null);
      refresh();
      toast.success('Draft deleted');
    },
    onError: (err) => {
      setDeleting(null);
      toast.error('Couldn’t delete the draft', apiErrorMessage(err));
    },
  });

  const count = (key: 'recipients' | 'answered' | 'skipped' | 'pending', header: string, wideOnly = false) => ({
    key,
    header,
    sortKey: key,
    sortFirst: 'desc' as const,
    align: 'right' as const,
    nowrap: true,
    className: wideOnly ? 'col-count col-wide-only' : 'col-count',
    render: (s: AdminSurveySummary) => s.counts[key],
  });

  const columns: Column<AdminSurveySummary, AdminSurveySortKey>[] = [
    idColumn((s) => s.id, 'id'),
    { key: 'title', header: 'Title', sortKey: 'title', className: 'col-title', render: (s) => s.title },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (s) => <Badge tone={SURVEY_STATUS_TONE[s.status]}>{SURVEY_STATUS_LABEL[s.status]}</Badge>,
    },
    count('recipients', 'Sent to'),
    count('answered', 'Answered'),
    // On the survey's own page too, so they make way below ~900px.
    count('skipped', 'Skipped', true),
    count('pending', 'No response', true),
    {
      key: 'rate',
      header: 'Response rate',
      sortKey: 'responseRate',
      sortFirst: 'desc',
      align: 'right',
      nowrap: true,
      className: 'col-count',
      render: (s) => responseRate(s.counts),
    },
    {
      key: 'created',
      header: 'Created',
      sortKey: 'createdAt',
      sortFirst: 'desc',
      nowrap: true,
      render: (s) => formatDate(s.createdAt),
    },
    actionsColumn((s) => (
      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <ActionMenu label={`Actions for ${s.title}`}>
          <MenuItem icon={<Eye size={ICON_SIZE.menu} />} onSelect={() => navigate(`/surveys/${s.id}`)}>
            Open
          </MenuItem>
          {canManage && s.status === 'DRAFT' && (
            <MenuItem icon={<Pencil size={ICON_SIZE.menu} />} onSelect={() => navigate(`/surveys/${s.id}?edit=1`)}>
              Edit
            </MenuItem>
          )}
          {canManage && (
            <MenuItem icon={<Copy size={ICON_SIZE.menu} />} onSelect={() => duplicate.mutate(s)}>
              Duplicate
            </MenuItem>
          )}
          {canManage && s.status !== 'CLOSED' && <MenuSeparator />}
          {canManage && s.status === 'DRAFT' && (
            <MenuItem danger icon={<Trash2 size={ICON_SIZE.menu} />} onSelect={() => setDeleting(s)}>
              Delete draft
            </MenuItem>
          )}
          {canManage && s.status === 'PUBLISHED' && (
            <MenuItem danger icon={<Lock size={ICON_SIZE.menu} />} onSelect={() => setClosing(s)}>
              Close survey
            </MenuItem>
          )}
        </ActionMenu>
      </div>
    )),
  ];

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
      {isLoading && <TableSkeleton columns={columns.length} />}
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
            columns={columns}
            rows={data.data}
            rowKey={(s) => s.id}
            onRowClick={(s) => navigate(`/surveys/${s.id}`)}
            sort={sort}
            onSortChange={onSortChange}
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
      {closing && (
        <ConfirmDialog
          title="Close this survey?"
          message={`${mothersWhoHavent(closing.counts.pending + closing.counts.skipped)} answered will no longer see it. Answers so far are kept. This can’t be undone.`}
          confirmLabel="Close survey"
          danger
          busy={close.isPending}
          onConfirm={() => close.mutate(closing)}
          onCancel={() => setClosing(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete this draft?"
          message={`“${deleting.title}” has not been sent to anyone.`}
          confirmLabel="Delete draft"
          danger
          busy={remove.isPending}
          onConfirm={() => remove.mutate(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
