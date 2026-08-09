import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { AdminUser } from '@nanny-app/shared';
import { summarisePermissions } from '@nanny-app/shared';

import {
  ActionMenu,
  Badge,
  Button,
  ConfirmDialog,
  ErrorState,
  MenuItem,
  PageHeader,
  Pencil,
  StaleRefreshBanner,
  Table,
  TableSkeleton,
  Trash2,
  ICON_SIZE,
  type Column,
  useToast,
} from '@admin/components/ui';
import { OperatorForm } from '@admin/features/operators/operator-form';
import { deleteAdmin, fetchAdmins } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

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
  return [manage > 0 && `${manage} manage`, view > 0 && `${view} view`]
    .filter(Boolean)
    .join(' · ');
}

export function AdminsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [removing, setRemoving] = useState<AdminUser | null>(null);

  const { data: admins, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admins'],
    queryFn: fetchAdmins,
  });

  const deleteMutation = useMutation({
    mutationFn: (admin: AdminUser) => deleteAdmin(admin.id),
    onSuccess: (_result, admin) => {
      void queryClient.invalidateQueries({ queryKey: ['admins'] });
      toast.success('Account removed', `${admin.name} can no longer sign in.`);
      setRemoving(null);
    },
    onError: (err) => toast.error('Couldn’t remove account', apiErrorMessage(err)),
  });

  const columns: Column<AdminUser>[] = [
    { key: 'name', header: 'Name', render: (admin) => admin.name },
    { key: 'email', header: 'Email', render: (admin) => admin.email },
    {
      key: 'role',
      header: 'Role',
      render: (admin) => (
        <Badge tone={admin.role === 'SUPERUSER' ? 'success' : 'neutral'}>
          {ROLE_LABELS[admin.role]}
        </Badge>
      ),
    },
    { key: 'access', header: 'Access', render: accessSummary },
    {
      key: 'status',
      header: 'Status',
      render: (admin) => (
        <Badge tone={admin.isActive ? 'success' : 'neutral'}>
          {admin.isActive ? 'active' : 'suspended'}
        </Badge>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      nowrap: true,
      render: (admin) => new Date(admin.createdAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: '',
      nowrap: true,
      render: (admin) => (
        // The root account owns this page; it can't edit or remove itself here.
        <ActionMenu label={`Actions for ${admin.name}`} disabled={admin.role === 'SUPERUSER'}>
          <MenuItem
            icon={<Pencil size={ICON_SIZE.menu} />}
            onSelect={() => {
              setEditing(admin);
              setFormOpen(true);
            }}
          >
            Edit access
          </MenuItem>
          <MenuItem
            icon={<Trash2 size={ICON_SIZE.menu} />}
            danger
            onSelect={() => setRemoving(admin)}
          >
            Remove
          </MenuItem>
        </ActionMenu>
      ),
    },
  ];

  return (
    <section>
      <PageHeader
        title="Team"
        subtitle="Who can sign in to the console, and how far each of them reaches. Only the superuser can see this page."
      />

      <div className="filter-bar">
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          Add team member
        </Button>
      </div>

      {isLoading && <TableSkeleton columns={7} />}
      {error != null && !admins && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {admins && (
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
            rows={admins}
            rowKey={(admin) => admin.id}
            empty="No team members yet."
          />
        </>
      )}

      {formOpen && (
        <OperatorForm
          {...(editing ? { editing } : {})}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      )}

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
    </section>
  );
}
