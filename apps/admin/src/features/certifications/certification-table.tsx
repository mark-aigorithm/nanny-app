import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { Certification, UpdateCertificationInput } from '@nanny-app/shared';

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
import { CertificationFormModal } from '@admin/features/certifications/certification-form';
import { deleteCertification, updateCertification } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';
import { useClientSort } from '@admin/lib/use-table-sort';

type CertificationSortKey = 'id' | 'name' | 'description' | 'status';

type CertificationTableProps = {
  certifications: Certification[];
};

export function CertificationTable({ certifications }: CertificationTableProps) {
  const canManage = useCanManage('certifications');
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Certification | null>(null);
  const [deleting, setDeleting] = useState<Certification | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['certifications'] });

  // The API lists certifications by name, so that is where the table starts.
  const { rows, sort, onSortChange } = useClientSort<Certification, CertificationSortKey>(
    certifications,
    {
      id: (row) => row.id,
      name: (cert) => cert.name,
      description: (cert) => cert.description,
      status: (cert) => (cert.isActive ? 'Active' : 'Inactive'),
    },
    { sortBy: 'name', sortDir: 'asc' },
  );

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateCertificationInput }) =>
      updateCertification(id, input),
    onSuccess: (updated) => {
      invalidate();
      toast.success('Certification updated', updated.name);
    },
    onError: (err) => toast.error('Couldn’t update certification', apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCertification,
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast.success('Certification deleted');
    },
    onError: (err) => toast.error('Couldn’t delete certification', apiErrorMessage(err)),
  });

  const columns: Column<Certification, CertificationSortKey>[] = [
    idColumn((row) => row.id, 'id'),
    { key: 'name', header: 'Name', sortKey: 'name', render: (cert) => cert.name },
    {
      key: 'description',
      header: 'Description',
      sortKey: 'description',
      render: (cert) => cert.description ?? <span className="table-empty">—</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (cert) => (
        <Badge tone={cert.isActive ? 'success' : 'neutral'}>
          {cert.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    actionsColumn((cert) => (
      <ActionMenu label={`Actions for ${cert.name}`} disabled={!canManage}>
        <MenuItem icon={<Pencil size={ICON_SIZE.menu} />} onSelect={() => setEditing(cert)}>
          Edit
        </MenuItem>
        <MenuItem
          icon={cert.isActive ? <Power size={ICON_SIZE.menu} /> : <Check size={ICON_SIZE.menu} />}
          disabled={updateMutation.isPending}
          onSelect={() =>
            updateMutation.mutate({ id: cert.id, input: { isActive: !cert.isActive } })
          }
        >
          {cert.isActive ? 'Deactivate' : 'Activate'}
        </MenuItem>
        <MenuSeparator />
        <MenuItem danger icon={<Trash2 size={ICON_SIZE.menu} />} onSelect={() => setDeleting(cert)}>
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
        rowKey={(cert) => cert.id}
        empty="No certifications yet — add the first one with “Add certification”."
        sort={sort}
        onSortChange={onSortChange}
      />

      {editing && (
        <CertificationFormModal certification={editing} onClose={() => setEditing(null)} />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete certification"
          message={`Delete “${deleting.name}”? Nannies tagged with it will lose the tag. This can’t be undone.`}
          confirmLabel="Delete certification"
          danger
          busy={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
