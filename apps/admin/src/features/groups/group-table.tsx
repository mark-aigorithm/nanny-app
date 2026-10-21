import type { UserGroup } from '@nanny-app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ActionMenu,
  actionsColumn,
  Badge,
  type Column,
  ConfirmDialog,
  ErrorState,
  ICON_SIZE,
  idColumn,
  MenuItem,
  MenuSeparator,
  Pencil,
  StaleRefreshBanner,
  Table,
  TableSkeleton,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { deleteUserGroup, fetchUserGroups } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';
import { useClientSort } from '@admin/lib/use-table-sort';

import { GroupFormModal } from './group-form';
import { GROUP_KIND_LABEL, GROUP_KIND_TONE } from './group-labels';

type GroupSortKey = 'id' | 'name' | 'kind' | 'memberCount' | 'createdAt';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });

/** Every group (loaded in full, sorted in the browser). A row opens the group. */
export function GroupTable() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = useCanManage('groups');
  const [editing, setEditing] = useState<UserGroup | null>(null);
  const [deleting, setDeleting] = useState<UserGroup | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['groups'],
    queryFn: fetchUserGroups,
  });
  const { rows, sort, onSortChange } = useClientSort<UserGroup, GroupSortKey>(
    data,
    {
      id: (g) => g.id,
      name: (g) => g.name,
      kind: (g) => GROUP_KIND_LABEL[g.kind],
      memberCount: (g) => g.memberCount,
      createdAt: (g) => g.createdAt,
    },
    { sortBy: 'createdAt', sortDir: 'desc' },
  );

  const remove = useMutation({
    mutationFn: (group: UserGroup) => deleteUserGroup(group.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      toast.success('Group deleted');
      setDeleting(null);
    },
    onError: (err) => toast.error('Couldn’t delete the group', apiErrorMessage(err)),
  });

  const columns: Column<UserGroup, GroupSortKey>[] = [
    idColumn((g) => g.id, 'id'),
    { key: 'name', header: 'Name', sortKey: 'name', width: '30%', render: (g) => g.name },
    {
      key: 'kind',
      header: 'Type',
      sortKey: 'kind',
      render: (g) => <Badge tone={GROUP_KIND_TONE[g.kind]}>{GROUP_KIND_LABEL[g.kind]}</Badge>,
    },
    { key: 'description', header: 'Description', render: (g) => g.description ?? '—' },
    {
      key: 'members',
      header: 'Members (now)',
      sortKey: 'memberCount',
      sortFirst: 'desc',
      render: (g) => g.memberCount,
    },
    {
      key: 'created',
      header: 'Created',
      sortKey: 'createdAt',
      sortFirst: 'desc',
      nowrap: true,
      render: (g) => formatDate(g.createdAt),
    },
    actionsColumn((g) => (
      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <ActionMenu label={`Actions for ${g.name}`} disabled={!canManage}>
          <MenuItem icon={<Pencil size={ICON_SIZE.menu} />} onSelect={() => setEditing(g)}>
            Edit
          </MenuItem>
          <MenuSeparator />
          <MenuItem danger icon={<Trash2 size={ICON_SIZE.menu} />} onSelect={() => setDeleting(g)}>
            Delete
          </MenuItem>
        </ActionMenu>
      </div>
    )),
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
            <StaleRefreshBanner
              message={apiErrorMessage(error)}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}
          <Table
            columns={columns}
            rows={rows ?? []}
            rowKey={(g) => g.id}
            onRowClick={(g) => navigate(`/groups/${g.id}`)}
            sort={sort}
            onSortChange={onSortChange}
            empty="No groups yet. Add one with “New group”: hand-pick mothers, or set rules that pick them for you."
          />
        </>
      )}
      {editing && <GroupFormModal group={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete this group?"
          message={`“${deleting.name}” will be removed. Anything already sent to it is not affected, and the mothers stay in the app.`}
          confirmLabel="Delete group"
          danger
          busy={remove.isPending}
          onConfirm={() => remove.mutate(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
