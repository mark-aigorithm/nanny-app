import type { NotificationTemplateListItem } from '@nanny-app/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ActionMenu,
  actionsColumn,
  Badge,
  type Column,
  ConfirmDialog,
  ICON_SIZE,
  idColumn,
  MenuItem,
  MenuSeparator,
  Pencil,
  Send,
  Table,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { deleteNotificationTemplate } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { formatDate } from '@admin/lib/format';
import { useCanManage } from '@admin/lib/permissions';
import { useClientSort } from '@admin/lib/use-table-sort';

import { CHANNEL_LABEL, formatCount } from './notification-labels';

// `updatedAt` has no column: it is only the opening order, matching the API's.
type TemplateSortKey =
  | 'id'
  | 'name'
  | 'channel'
  | 'audience'
  | 'publishCount'
  | 'lastPublishedAt'
  | 'updatedAt';

/** "37 mothers" → "37"; a group audience keeps its unit ("2 groups"), since that counts groups. */
const audienceCount = (summary: string) => summary.replace(/ mothers?$/, '');

/** Every notification template (loaded in full, sorted in the browser). A row opens its editor. */
export function TemplateTable({ templates }: { templates: NotificationTemplateListItem[] }) {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = useCanManage('notifications');
  const [deleting, setDeleting] = useState<NotificationTemplateListItem | null>(null);

  const { rows, sort, onSortChange } = useClientSort<NotificationTemplateListItem, TemplateSortKey>(
    templates,
    {
      id: (t) => t.id,
      name: (t) => t.name,
      channel: (t) => CHANNEL_LABEL[t.channel],
      audience: (t) => t.audienceSummary,
      publishCount: (t) => t.publishCount,
      lastPublishedAt: (t) => t.lastPublishedAt,
      updatedAt: (t) => t.updatedAt,
    },
    { sortBy: 'updatedAt', sortDir: 'desc' },
  );

  const remove = useMutation({
    mutationFn: (t: NotificationTemplateListItem) => deleteNotificationTemplate(t.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-templates'] });
      toast.success('Template deleted');
      setDeleting(null);
    },
    onError: (err) => toast.error('Couldn’t delete the template', apiErrorMessage(err)),
  });

  const columns: Column<NotificationTemplateListItem, TemplateSortKey>[] = [
    idColumn((t) => t.id, 'id'),
    { key: 'name', header: 'Name', sortKey: 'name', width: '30%', render: (t) => t.name },
    {
      key: 'channel',
      header: 'Channel',
      sortKey: 'channel',
      nowrap: true,
      render: (t) => <Badge>{CHANNEL_LABEL[t.channel]}</Badge>,
    },
    {
      key: 'audience',
      header: 'Audience count',
      sortKey: 'audience',
      nowrap: true,
      render: (t) => audienceCount(t.audienceSummary),
    },
    {
      key: 'publishCount',
      header: 'Times sent',
      sortKey: 'publishCount',
      sortFirst: 'desc',
      align: 'right',
      render: (t) => formatCount(t.publishCount),
    },
    {
      key: 'lastPublishedAt',
      header: 'Last sent',
      sortKey: 'lastPublishedAt',
      sortFirst: 'desc',
      nowrap: true,
      render: (t) => (t.lastPublishedAt ? formatDate(t.lastPublishedAt) : <span className="table-empty">Never</span>),
    },
    actionsColumn((t) => (
      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <ActionMenu label={`Actions for ${t.name}`} disabled={!canManage}>
          <MenuItem icon={<Pencil size={ICON_SIZE.menu} />} onSelect={() => navigate(`/notifications/${t.id}?edit=1`)}>
            Edit
          </MenuItem>
          <MenuItem
            icon={<Send size={ICON_SIZE.menu} />}
            onSelect={() => navigate(`/notifications/${t.id}?publish=1`)}
          >
            Publish
          </MenuItem>
          <MenuSeparator />
          <MenuItem danger icon={<Trash2 size={ICON_SIZE.menu} />} onSelect={() => setDeleting(t)}>
            Delete
          </MenuItem>
        </ActionMenu>
      </div>
    )),
  ];

  return (
    <>
      <Table
        columns={columns}
        rows={rows ?? []}
        rowKey={(t) => t.id}
        onRowClick={(t) => navigate(`/notifications/${t.id}`)}
        sort={sort}
        onSortChange={onSortChange}
        empty="No notifications yet. Write one with “New template”, then publish it whenever you want to send it."
      />
      {deleting && (
        <ConfirmDialog
          title="Delete this template?"
          message={`“${deleting.name}” will be removed. Its send history is kept, and mothers keep what they already received.`}
          confirmLabel="Delete template"
          danger
          busy={remove.isPending}
          onConfirm={() => remove.mutate(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
