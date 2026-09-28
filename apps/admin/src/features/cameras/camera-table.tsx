import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { Camera } from '@nanny-app/shared';

import {
  ActionMenu,
  actionsColumn,
  Badge,
  type Column,
  idColumn,
  ConfirmDialog,
  ICON_SIZE,
  MenuItem,
  MenuSeparator,
  Pencil,
  Table,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { CameraFormModal } from '@admin/features/cameras/camera-form';
import { deleteCamera } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';
import { useClientSort } from '@admin/lib/use-table-sort';

type CameraSortKey = 'id' | 'name' | 'stream' | 'nanny' | 'created';

type CameraTableProps = {
  cameras: Camera[];
};

export function CameraTable({ cameras }: CameraTableProps) {
  const canManage = useCanManage('cameras');
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Camera | null>(null);
  const [deleting, setDeleting] = useState<Camera | null>(null);

  // The API lists cameras newest first, so that is where the table starts.
  const { rows, sort, onSortChange } = useClientSort<Camera, CameraSortKey>(
    cameras,
    {
      id: (row) => row.id,
      name: (camera) => camera.name,
      stream: (camera) => camera.streamUrl,
      // Unassigned cameras have no name to sort by, so they go last either way.
      nanny: (camera) => camera.nannyName,
      created: (camera) => Date.parse(camera.createdAt),
    },
    { sortBy: 'created', sortDir: 'desc' },
  );

  const deleteMutation = useMutation({
    mutationFn: deleteCamera,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cameras'] });
      setDeleting(null);
      toast.success('Camera deleted');
    },
    onError: (err) => toast.error('Couldn’t delete camera', apiErrorMessage(err)),
  });

  const columns: Column<Camera, CameraSortKey>[] = [
    idColumn((row) => row.id, 'id'),
    { key: 'name', header: 'Name', sortKey: 'name', render: (camera) => camera.name },
    {
      key: 'stream',
      header: 'Stream URL',
      sortKey: 'stream',
      render: (camera) => (
        <a href={camera.streamUrl} target="_blank" rel="noreferrer">
          {camera.streamUrl}
        </a>
      ),
    },
    {
      key: 'nanny',
      header: 'Nanny',
      sortKey: 'nanny',
      render: (camera) =>
        camera.nannyName ? camera.nannyName : <Badge tone="neutral">Unassigned</Badge>,
    },
    {
      key: 'created',
      header: 'Created',
      sortKey: 'created',
      sortFirst: 'desc',
      nowrap: true,
      render: (camera) => new Date(camera.createdAt).toLocaleDateString(),
    },
    actionsColumn((camera) => (
      <ActionMenu label={`Actions for ${camera.name}`} disabled={!canManage}>
        <MenuItem icon={<Pencil size={ICON_SIZE.menu} />} onSelect={() => setEditing(camera)}>
          Edit
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          danger
          icon={<Trash2 size={ICON_SIZE.menu} />}
          onSelect={() => setDeleting(camera)}
        >
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
        rowKey={(camera) => camera.id}
        empty="No cameras yet — add the first one with “Add camera”."
        sort={sort}
        onSortChange={onSortChange}
      />

      {editing && <CameraFormModal camera={editing} onClose={() => setEditing(null)} />}

      {deleting && (
        <ConfirmDialog
          title="Delete camera"
          message={`Delete “${deleting.name}”? Its stream will stop being available. This can’t be undone.`}
          confirmLabel="Delete camera"
          danger
          busy={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
