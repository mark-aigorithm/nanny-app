import type { NotificationBroadcast, NotificationBroadcastStatus } from '@nanny-app/shared';
import { useQuery } from '@tanstack/react-query';

import {
  Badge,
  type Column,
  ErrorState,
  StaleRefreshBanner,
  Table,
  TableSkeleton,
} from '@admin/components/ui';
import { listTemplateBroadcasts } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { formatDateTime } from '@admin/lib/format';
import { useClientSort } from '@admin/lib/use-table-sort';

import { BROADCAST_STATUS_LABEL, BROADCAST_STATUS_TONE, formatCount } from './notification-labels';

type HistorySortKey =
  | 'createdAt'
  | 'publishedBy'
  | 'status'
  | 'targeted'
  | 'inAppCreated'
  | 'pushSent'
  | 'pushFailed'
  | 'noDevice';

/** Problems first when sorting by status. */
const STATUS_RANK: Record<NotificationBroadcastStatus, number> = { FAILED: 0, PARTIAL: 1, SENDING: 2, SENT: 3 };

const EMPTY = <span className="table-empty">—</span>;

/** The error (incl. "Timed out"), or the deleted groups a send skipped. */
function note(b: NotificationBroadcast): string | null {
  if (b.error) return b.error;
  const n = b.skippedGroupIds.length;
  return n > 0 ? `${n} deleted ${n === 1 ? 'group' : 'groups'} skipped` : null;
}

/** Every publish of one template, newest first, with what went out. */
export function BroadcastHistory({ templateId }: { templateId: number }) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['notification-templates', templateId, 'broadcasts'],
    queryFn: () => listTemplateBroadcasts(templateId),
    // A send in flight finishes within a minute (or reads as timed out after five): poll until it settles.
    refetchInterval: (query) => (query.state.data?.some((b) => b.status === 'SENDING') ? 5000 : false),
  });
  const { rows, sort, onSortChange } = useClientSort<NotificationBroadcast, HistorySortKey>(
    data,
    {
      createdAt: (b) => b.createdAt,
      publishedBy: (b) => b.publishedBy.name,
      status: (b) => STATUS_RANK[b.status],
      targeted: (b) => b.targeted,
      inAppCreated: (b) => b.inAppCreated,
      pushSent: (b) => b.pushSent,
      pushFailed: (b) => b.pushFailed,
      noDevice: (b) => b.noDevice,
    },
    { sortBy: 'createdAt', sortDir: 'desc' },
  );

  const inbox = (b: NotificationBroadcast, n: number) => (b.channel === 'PUSH' ? EMPTY : formatCount(n));
  const push = (b: NotificationBroadcast, n: number) => (b.channel === 'IN_APP' ? EMPTY : formatCount(n));
  const columns: Column<NotificationBroadcast, HistorySortKey>[] = [
    { key: 'createdAt', header: 'Date', sortKey: 'createdAt', sortFirst: 'desc', nowrap: true, render: (b) => formatDateTime(b.createdAt) },
    { key: 'publishedBy', header: 'Published by', sortKey: 'publishedBy', render: (b) => b.publishedBy.name },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (b) => <Badge tone={BROADCAST_STATUS_TONE[b.status]}>{BROADCAST_STATUS_LABEL[b.status]}</Badge>,
    },
    { key: 'targeted', header: 'Targeted', sortKey: 'targeted', sortFirst: 'desc', align: 'right', render: (b) => formatCount(b.targeted) },
    { key: 'inApp', header: 'In-app', sortKey: 'inAppCreated', sortFirst: 'desc', align: 'right', render: (b) => inbox(b, b.inAppCreated) },
    { key: 'pushSent', header: 'Push sent', sortKey: 'pushSent', sortFirst: 'desc', align: 'right', render: (b) => push(b, b.pushSent) },
    { key: 'pushFailed', header: 'Push failed', sortKey: 'pushFailed', sortFirst: 'desc', align: 'right', render: (b) => push(b, b.pushFailed) },
    { key: 'noDevice', header: 'No device', sortKey: 'noDevice', sortFirst: 'desc', align: 'right', render: (b) => push(b, b.noDevice) },
    { key: 'note', header: 'Note', render: (b) => note(b) ?? EMPTY },
  ];

  return (
    <>
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
            rows={rows ?? []}
            rowKey={(b) => b.id}
            sort={sort}
            onSortChange={onSortChange}
            empty="Not sent yet. Each time you publish, the send is listed here with its counts."
          />
        </>
      )}
    </>
  );
}
