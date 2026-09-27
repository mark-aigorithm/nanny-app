import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { AdminUser } from '@nanny-app/shared';
import { summarisePermissions } from '@nanny-app/shared';

import {
  ActionMenu,
  actionsColumn,
  Badge,
  type Column,
  ConfirmDialog,
  ICON_SIZE,
  MenuItem,
  MenuSeparator,
  Pencil,
  Table,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { OperatorFormModal } from '@admin/features/operators/operator-form';
import { deleteAdmin } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useClientSort } from '@admin/lib/use-table-sort';

type OperatorSortKey = 'name' | 'email' | 'role' | 'access' | 'status' | 'created';

const ROLE_LABELS: Record<AdminUser['role'], string> = {
  SUPERUSER: 'superuser',
  ADMIN: 'admin',
  OPERATOR: 'operator',
};

/** "Full access" for admins; "4 view · 2 manage" for a scoped operator. */
function accessSummary(admin: AdminUser): string {
  if (admin.role !== 'OPERATOR') return 'Full access';
  const { view, manage } = summarisePermissions(admin.permissions);
  if (view + manage === 0) return 'No sections';
  return [manage > 0 && `${manage} manage`, view > 0 && `${view} view`].filter(Boolean).join(' · ');
}

/** How far an account reaches, as one number: full access above any grant, manage above view. */
function accessReach(admin: AdminUser): number {
  if (admin.role !== 'OPERATOR') return Number.MAX_SAFE_INTEGER;
  const { view, manage } = summarisePermissions(admin.permissions);
  return manage * 2 + view;
}

type OperatorTableProps = {
  admins: AdminUser[];
};

export function OperatorTable({ admins }: OperatorTableProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [removing, setRemoving] = useState<AdminUser | null>(null);

  // Oldest first — the order the API lists the team in.
  const { rows, sort, onSortChange } = useClientSort<AdminUser, OperatorSortKey>(
    admins,
    {
      name: (admin) => admin.name,
      email: (admin) => admin.email,
      role: (admin) => ROLE_LABELS[admin.role],
      access: accessReach,
      status: (admin) => (admin.isActive ? 'active' : 'suspended'),
      created: (admin) => Date.parse(admin.createdAt),
    },
    { sortBy: 'created', sortDir: 'asc' },
  );

  const deleteMutation = useMutation({
    mutationFn: (admin: AdminUser) => deleteAdmin(admin.id),
    onSuccess: (_result, admin) => {
      void queryClient.invalidateQueries({ queryKey: ['admins'] });
      toast.success('Account removed', `${admin.name} can no longer sign in.`);
      setRemoving(null);
    },
    onError: (err) => toast.error('Couldn’t remove account', apiErrorMessage(err)),
  });

  const columns: Column<AdminUser, OperatorSortKey>[] = [
    { key: 'name', header: 'Name', sortKey: 'name', render: (admin) => admin.name },
    { key: 'email', header: 'Email', sortKey: 'email', render: (admin) => admin.email },
    {
      key: 'role',
      header: 'Role',
      sortKey: 'role',
      render: (admin) => (
        <Badge tone={admin.role === 'SUPERUSER' ? 'success' : 'neutral'}>
          {ROLE_LABELS[admin.role]}
        </Badge>
      ),
    },
    {
      key: 'access',
      header: 'Access',
      sortKey: 'access',
      sortFirst: 'desc',
      render: accessSummary,
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (admin) => (
        <Badge tone={admin.isActive ? 'success' : 'neutral'}>
          {admin.isActive ? 'active' : 'suspended'}
        </Badge>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      sortKey: 'created',
      sortFirst: 'desc',
      nowrap: true,
      render: (admin) => new Date(admin.createdAt).toLocaleDateString(),
    },
    actionsColumn((admin) => (
      // The root account owns this page; it can't edit or remove itself here.
      <ActionMenu label={`Actions for ${admin.name}`} disabled={admin.role === 'SUPERUSER'}>
        <MenuItem icon={<Pencil size={ICON_SIZE.menu} />} onSelect={() => setEditing(admin)}>
          Edit
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          danger
          icon={<Trash2 size={ICON_SIZE.menu} />}
          onSelect={() => setRemoving(admin)}
        >
          Remove
        </MenuItem>
      </ActionMenu>
    )),
  ];

  return (
    <>
      <Table
        columns={columns}
        rows={rows ?? []}
        rowKey={(admin) => admin.id}
        empty="No team members yet — add the first one with “Add team member”."
        sort={sort}
        onSortChange={onSortChange}
      />

      {editing && <OperatorFormModal admin={editing} onClose={() => setEditing(null)} />}

      {removing && (
        <ConfirmDialog
          danger
          title="Remove team member"
          message={`${removing.name} will be signed out and won’t be able to sign in again. Their past actions stay on record.`}
          confirmLabel="Remove"
          busy={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  );
}
