import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { Camera } from '@nanny-app/shared';

import {
  ActionMenu,
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
import { deleteCamera } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

type CameraTableProps = {
  cameras: Camera[];
  onEdit: (camera: Camera) => void;
};

export function CameraTable({ cameras, onEdit }: CameraTableProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [deleting, setDeleting] = useState<Camera | null>(null);

  const deleteMutation = useMutation({
    mutationFn: deleteCamera,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cameras'] });
      setDeleting(null);
      toast.success('Camera deleted');
    },
    onError: (err) => toast.error('Couldn’t delete camera', apiErrorMessage(err)),
  });

  const columns: Column<Camera>[] = [
    { key: 'name', header: 'Name', render: (camera) => camera.name },
    {
      key: 'stream',
      header: 'Stream URL',
      render: (camera) => (
        <a href={camera.streamUrl} target="_blank" rel="noreferrer">
          {camera.streamUrl}
        </a>
      ),
    },
    {
      key: 'nanny',
      header: 'Nanny',
      render: (camera) =>
        camera.nannyName ? camera.nannyName : <Badge tone="neutral">Unassigned</Badge>,
    },
    {
      key: 'created',
      header: 'Created',
      nowrap: true,
      render: (camera) => new Date(camera.createdAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (camera) => (
        <ActionMenu label={`Actions for ${camera.name}`}>
          <MenuItem icon={<Pencil size={ICON_SIZE.menu} />} onSelect={() => onEdit(camera)}>
            Edit
          </MenuItem>
          <MenuSeparator />
          <MenuItem danger icon={<Trash2 size={ICON_SIZE.menu} />} onSelect={() => setDeleting(camera)}>
            Delete
          </MenuItem>
        </ActionMenu>
      ),
    },
  ];

  return (
    <>
      <Table
        columns={columns}
        rows={cameras}
        rowKey={(camera) => camera.id}
        empty="No cameras yet — add the first one above."
      />

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
