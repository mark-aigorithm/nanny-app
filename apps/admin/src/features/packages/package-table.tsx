import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { Package, UpdatePackageInput } from '@nanny-app/shared';

import {
  ActionMenu,
  actionsColumn,
  Badge,
  Check,
  type Column,
  idColumn,
  ConfirmDialog,
  ICON_SIZE,
  MenuItem,
  MenuSeparator,
  Pencil,
  Power,
  Table,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { PackageFormModal } from '@admin/features/packages/package-form';
import { deletePackage, updatePackage } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { formatDateTime, formatEgp } from '@admin/lib/format';
import { useCanManage } from '@admin/lib/permissions';
import { useClientSort } from '@admin/lib/use-table-sort';

type PackageSortKey =
  | 'id'
  | 'name'
  | 'hours'
  | 'price'
  | 'validityDays'
  | 'maxSkills'
  | 'expiresAt'
  | 'status';

type PackageTableProps = {
  packages: Package[];
};

export function PackageTable({ packages }: PackageTableProps) {
  const canManage = useCanManage('packages');
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Package | null>(null);
  const [deleting, setDeleting] = useState<Package | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['packages'] });

  // Loaded in full, so it sorts in the browser — by name to start, as the API returns it.
  const { rows, sort, onSortChange } = useClientSort<Package, PackageSortKey>(
    packages,
    {
      id: (row) => row.id,
      name: (pkg) => pkg.name,
      hours: (pkg) => pkg.hours,
      price: (pkg) => pkg.price,
      validityDays: (pkg) => pkg.validityDays,
      maxSkills: (pkg) => pkg.maxSkills,
      expiresAt: (pkg) => pkg.expiresAt,
      status: (pkg) => (pkg.isActive ? 'Active' : 'Inactive'),
    },
    { sortBy: 'name', sortDir: 'asc' },
  );

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdatePackageInput }) =>
      updatePackage(id, input),
    onSuccess: (updated) => {
      invalidate();
      toast.success('Package updated', updated.name);
    },
    onError: (err) => toast.error('Couldn’t update package', apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: deletePackage,
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast.success('Package deleted');
    },
    onError: (err) => toast.error('Couldn’t delete package', apiErrorMessage(err)),
  });

  const columns: Column<Package, PackageSortKey>[] = [
    idColumn((row) => row.id, 'id'),
    { key: 'name', header: 'Name', sortKey: 'name', render: (pkg) => pkg.name },
    {
      key: 'hours',
      header: 'Hours',
      sortKey: 'hours',
      sortFirst: 'desc',
      render: (pkg) => `${pkg.hours} h`,
    },
    {
      key: 'price',
      header: 'Price',
      sortKey: 'price',
      sortFirst: 'desc',
      render: (pkg) => formatEgp(pkg.price),
    },
    {
      key: 'validityDays',
      header: 'Validity',
      sortKey: 'validityDays',
      sortFirst: 'desc',
      render: (pkg) => `${pkg.validityDays} d`,
    },
    {
      key: 'maxSkills',
      header: 'Free skills',
      sortKey: 'maxSkills',
      sortFirst: 'desc',
      render: (pkg) => String(pkg.maxSkills),
    },
    {
      key: 'expiresAt',
      header: 'Expires',
      sortKey: 'expiresAt',
      sortFirst: 'desc',
      render: (pkg) =>
        pkg.expiresAt ? formatDateTime(pkg.expiresAt) : <span className="table-empty">Never</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (pkg) => (
        <Badge tone={pkg.isActive ? 'success' : 'neutral'}>
          {pkg.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    actionsColumn((pkg) => (
      <ActionMenu label={`Actions for ${pkg.name}`} disabled={!canManage}>
        <MenuItem icon={<Pencil size={ICON_SIZE.menu} />} onSelect={() => setEditing(pkg)}>
          Edit
        </MenuItem>
        <MenuItem
          icon={pkg.isActive ? <Power size={ICON_SIZE.menu} /> : <Check size={ICON_SIZE.menu} />}
          disabled={updateMutation.isPending}
          onSelect={() => updateMutation.mutate({ id: pkg.id, input: { isActive: !pkg.isActive } })}
        >
          {pkg.isActive ? 'Deactivate' : 'Activate'}
        </MenuItem>
        <MenuSeparator />
        <MenuItem danger icon={<Trash2 size={ICON_SIZE.menu} />} onSelect={() => setDeleting(pkg)}>
          Delete
        </MenuItem>
      </ActionMenu>
    )),
  ];

  return (
    <>
      <Table
        columns={columns}
        rows={rows ?? []}
        rowKey={(pkg) => pkg.id}
        empty="No packages yet — add the first one with “Add package”."
        sort={sort}
        onSortChange={onSortChange}
      />

      {editing && <PackageFormModal pkg={editing} onClose={() => setEditing(null)} />}

      {deleting && (
        <ConfirmDialog
          title="Delete package"
          message={`Delete “${deleting.name}”? This can’t be undone.`}
          confirmLabel="Delete package"
          danger
          busy={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
