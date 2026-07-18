import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { Certification, UpdateCertificationInput } from '@nanny-app/shared';

import {
  ActionMenu,
  Badge,
  Button,
  Check,
  type Column,
  ConfirmDialog,
  ICON_SIZE,
  MenuItem,
  MenuSeparator,
  Modal,
  Pencil,
  Power,
  Table,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { deleteCertification, updateCertification } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

type CertificationTableProps = {
  certifications: Certification[];
};

export function CertificationTable({ certifications }: CertificationTableProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Certification | null>(null);
  const [deleting, setDeleting] = useState<Certification | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['certifications'] });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCertificationInput }) =>
      updateCertification(id, input),
    onSuccess: (updated) => {
      invalidate();
      setEditing(null);
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

  const columns: Column<Certification>[] = [
    { key: 'name', header: 'Name', render: (cert) => cert.name },
    {
      key: 'description',
      header: 'Description',
      render: (cert) => cert.description ?? <span className="table-empty">—</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (cert) => (
        <Badge tone={cert.isActive ? 'success' : 'neutral'}>
          {cert.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (cert) => (
        <ActionMenu label={`Actions for ${cert.name}`}>
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
      ),
    },
  ];

  return (
    <>
      <Table
        columns={columns}
        rows={certifications}
        rowKey={(cert) => cert.id}
        empty="No certifications yet — create the first one above."
      />

      {editing && (
        <CertificationEditModal
          certification={editing}
          busy={updateMutation.isPending}
          onCancel={() => setEditing(null)}
          onSave={(input) => updateMutation.mutate({ id: editing.id, input })}
        />
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

function CertificationEditModal({
  certification,
  busy,
  onCancel,
  onSave,
}: {
  certification: Certification;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: UpdateCertificationInput) => void;
}) {
  const [name, setName] = useState(certification.name);
  const [description, setDescription] = useState(certification.description ?? '');
  const canSave = !busy && name.trim().length > 0;

  return (
    <Modal
      title="Edit certification"
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={!canSave}
            onClick={() => onSave({ name: name.trim(), description: description.trim() || undefined })}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="modal-field field">
        <label className="field-label" htmlFor="certification-name">
          Name
        </label>
        <input
          id="certification-name"
          className="input"
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="modal-field field">
        <label className="field-label" htmlFor="certification-description">
          Description
        </label>
        <input
          id="certification-description"
          className="input"
          value={description}
          placeholder="Optional — shown to admins only"
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
    </Modal>
  );
}
