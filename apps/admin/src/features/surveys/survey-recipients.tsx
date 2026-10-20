import {
  ADMIN_PAGE_SIZES,
  type AdminSurvey,
  type AdminSurveyRecipient,
  type AdminSurveyRecipientSortKey,
  type SurveyRecipientStatus,
  type SurveyResendInput,
} from '@nanny-app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  Badge,
  Button,
  type Column,
  ConfirmDialog,
  ErrorState,
  FilterSelect,
  Pagination,
  StaleRefreshBanner,
  Table,
  TableSkeleton,
  useToast,
} from '@admin/components/ui';
import { fetchSurveyRecipients, resendSurvey } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';
import { usePagination } from '@admin/lib/use-pagination';
import { useTableSort } from '@admin/lib/use-table-sort';

import { RecipientAnswersModal } from './recipient-answers-modal';
import { RECIPIENT_STATUS_LABEL, RECIPIENT_STATUS_TONE } from './survey-labels';

type StatusFilter = '' | SurveyRecipientStatus;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'ANSWERED', label: 'Answered' },
  { value: 'SKIPPED', label: 'Skipped' },
  { value: 'PENDING', label: 'No response' },
];

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

type PendingResend = { body: SurveyResendInput; count: number; who: string };

/** Who answered, skipped or hasn't responded, with resend controls while the survey is open. */
export function SurveyRecipients({ survey }: { survey: AdminSurvey }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = useCanManage('surveys');
  const { page, limit, setPage, setLimit, reset } = usePagination();
  const { sort, onSortChange } = useTableSort<AdminSurveyRecipientSortKey>(
    { sortBy: 'lastSentAt', sortDir: 'desc' },
    reset,
  );
  const [status, setStatus] = useState<StatusFilter>('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirm, setConfirm] = useState<PendingResend | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  // A closed survey refuses resends (409), so the controls only exist while it is open.
  const canResend = canManage && survey.status === 'PUBLISHED';

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['surveys', survey.id, 'recipients', { status, page, limit, ...sort }],
    queryFn: () => fetchSurveyRecipients(survey.id, { status: status || undefined, page, limit, ...sort }),
  });

  const resend = useMutation({
    mutationFn: (body: SurveyResendInput) => resendSurvey(survey.id, body),
    onSuccess: ({ count }) => {
      toast.success(`Sent again to ${count} ${count === 1 ? 'mother' : 'mothers'}`);
      setConfirm(null);
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ['surveys'] });
    },
    onError: (err) => {
      setConfirm(null);
      toast.error('Couldn’t resend', apiErrorMessage(err));
    },
  });

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const columns: Column<AdminSurveyRecipient, AdminSurveyRecipientSortKey>[] = [
    ...(canResend
      ? [
          {
            key: 'select',
            header: '',
            render: (r: AdminSurveyRecipient) => (
              <input
                type="checkbox"
                aria-label={`Select ${r.name}`}
                disabled={r.status === 'ANSWERED'}
                checked={selected.has(r.userId)}
                onChange={() => toggle(r.userId)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
            ),
          },
        ]
      : []),
    {
      key: 'name',
      header: 'Mother',
      sortKey: 'name',
      sortFirst: 'asc',
      width: '25%',
      // The keyboard and screen-reader way to open her answers; the row click is the mouse shortcut.
      render: (r) => (
        <button
          type="button"
          className="table-link"
          aria-haspopup="dialog"
          onClick={(e) => {
            e.stopPropagation();
            setViewing(r.userId);
          }}
        >
          {r.name}
        </button>
      ),
    },
    { key: 'phone', header: 'Phone', nowrap: true, render: (r) => r.phone ?? '—' },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (r) => <Badge tone={RECIPIENT_STATUS_TONE[r.status]}>{RECIPIENT_STATUS_LABEL[r.status]}</Badge>,
    },
    { key: 'sent', header: 'Times sent', sortKey: 'sentCount', sortFirst: 'desc', align: 'right', render: (r) => r.sentCount },
    { key: 'lastSent', header: 'Last sent', sortKey: 'lastSentAt', sortFirst: 'desc', nowrap: true, render: (r) => when(r.lastSentAt) },
    { key: 'answered', header: 'Answered', sortKey: 'answeredAt', sortFirst: 'desc', nowrap: true, render: (r) => when(r.answeredAt) },
  ];

  return (
    <>
      <div className="filter-bar">
        <FilterSelect
          label="Status"
          value={status}
          options={STATUS_OPTIONS}
          onChange={(v) => {
            setStatus(v as StatusFilter);
            reset();
          }}
        />
        {canResend && (
          <div className="filter-bar-actions">
            <Button
              variant="ghost"
              disabled={survey.counts.skipped === 0}
              onClick={() => setConfirm({ body: { status: 'SKIPPED' }, count: survey.counts.skipped, who: 'every mother who skipped' })}
            >
              Resend to all skipped ({survey.counts.skipped})
            </Button>
            <Button
              variant="ghost"
              disabled={survey.counts.pending === 0}
              onClick={() => setConfirm({ body: { status: 'PENDING' }, count: survey.counts.pending, who: 'every mother who hasn’t responded' })}
            >
              Resend to all no-response ({survey.counts.pending})
            </Button>
            <Button
              disabled={selected.size === 0}
              onClick={() => setConfirm({ body: { userIds: [...selected] }, count: selected.size, who: 'the selected mothers' })}
            >
              Resend to selected ({selected.size})
            </Button>
          </div>
        )}
      </div>
      {isLoading && <TableSkeleton columns={columns.length} />}
      {error != null && !data && (
        <ErrorState message={apiErrorMessage(error)} onRetry={() => void refetch()} retrying={isFetching} />
      )}
      {data && (
        <>
          {error != null && (
            <StaleRefreshBanner message={apiErrorMessage(error)} onRetry={() => void refetch()} retrying={isFetching} />
          )}
          <Table
            columns={columns}
            rows={data.data}
            rowKey={(r) => r.userId}
            onRowClick={(r) => setViewing(r.userId)}
            rowClickMouseOnly
            sort={sort}
            onSortChange={onSortChange}
            empty="Nobody here. Try a different status."
          />
          <Pagination
            page={page}
            totalPages={data.meta.totalPages}
            total={data.meta.total}
            limit={limit}
            onPageChange={setPage}
            limitOptions={ADMIN_PAGE_SIZES}
            onLimitChange={setLimit}
            label="mothers"
          />
        </>
      )}
      {confirm && (
        <ConfirmDialog
          title={`Resend to ${confirm.count} ${confirm.count === 1 ? 'mother' : 'mothers'}?`}
          message={`This notifies ${confirm.who} again and prompts them to answer next time they open the app. Mothers who already answered are skipped.`}
          confirmLabel="Resend"
          busy={resend.isPending}
          onConfirm={() => resend.mutate(confirm.body)}
          onCancel={() => setConfirm(null)}
        />
      )}
      {viewing !== null && <RecipientAnswersModal survey={survey} userId={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}
