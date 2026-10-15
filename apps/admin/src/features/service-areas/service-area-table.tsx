import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { polygonAreaKm2 } from '@nanny-app/shared';
import type { ServiceArea, UpdateServiceAreaInput } from '@nanny-app/shared';

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
import { ServiceAreaFormModal } from '@admin/features/service-areas/service-area-form';
import { deleteServiceArea, updateServiceArea } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';
import { useClientSort } from '@admin/lib/use-table-sort';

type ServiceAreaSortKey = 'id' | 'name' | 'size' | 'status';

const SOURCE_LABEL: Record<ServiceArea['source'], string> = {
  osm: 'Map border',
  bbox: 'Rough box',
  drawn: 'Drawn',
};

type ServiceAreaTableProps = {
  areas: ServiceArea[];
};

export function ServiceAreaTable({ areas }: ServiceAreaTableProps) {
  const canManage = useCanManage('serviceAreas');
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<ServiceArea | null>(null);
  const [deleting, setDeleting] = useState<ServiceArea | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['service-areas'] });

  const { rows, sort, onSortChange } = useClientSort<ServiceArea, ServiceAreaSortKey>(
    areas,
    {
      id: (a) => a.id,
      name: (a) => a.name,
      size: (a) => polygonAreaKm2(a.polygon),
      status: (a) => (a.isActive ? 'Active' : 'Inactive'),
    },
    { sortBy: 'name', sortDir: 'asc' },
  );

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateServiceAreaInput }) =>
      updateServiceArea(id, input),
    onSuccess: (updated) => {
      invalidate();
      toast.success('Area updated', updated.name);
    },
    onError: (err) => toast.error('Couldn’t update area', apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteServiceArea,
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast.success('Area deleted');
    },
    onError: (err) => toast.error('Couldn’t delete area', apiErrorMessage(err)),
  });

  const columns: Column<ServiceArea, ServiceAreaSortKey>[] = [
    idColumn((row) => row.id, 'id'),
    { key: 'name', header: 'Name', sortKey: 'name', width: '45%', render: (a) => a.name },
    {
      key: 'size',
      header: 'Size',
      sortKey: 'size',
      render: (a) => `${polygonAreaKm2(a.polygon).toFixed(1)} km²`,
    },
    {
      key: 'source',
      header: 'Started from',
      render: (a) => SOURCE_LABEL[a.source],
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (a) => (
        <Badge tone={a.isActive ? 'success' : 'neutral'}>{a.isActive ? 'Active' : 'Inactive'}</Badge>
      ),
    },
    actionsColumn((a) => (
      <ActionMenu label={`Actions for ${a.name}`} disabled={!canManage}>
        <MenuItem icon={<Pencil size={ICON_SIZE.menu} />} onSelect={() => setEditing(a)}>
          Edit
        </MenuItem>
        <MenuItem
          icon={a.isActive ? <Power size={ICON_SIZE.menu} /> : <Check size={ICON_SIZE.menu} />}
          disabled={updateMutation.isPending}
          onSelect={() => updateMutation.mutate({ id: a.id, input: { isActive: !a.isActive } })}
        >
          {a.isActive ? 'Deactivate' : 'Activate'}
        </MenuItem>
        <MenuSeparator />
        <MenuItem danger icon={<Trash2 size={ICON_SIZE.menu} />} onSelect={() => setDeleting(a)}>
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
        rowKey={(a) => a.id}
        empty="No areas yet — mothers can book anywhere until you add one."
        sort={sort}
        onSortChange={onSortChange}
      />

      {editing && <ServiceAreaFormModal area={editing} onClose={() => setEditing(null)} />}

      {deleting && (
        <ConfirmDialog
          title="Delete area"
          message={`Delete “${deleting.name}”? Mothers there can no longer book unless another active area covers them — or everyone can, if it was the last active one.`}
          confirmLabel="Delete area"
          danger
          busy={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
