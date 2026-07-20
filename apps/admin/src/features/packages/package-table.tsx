import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { Package, UpdatePackageInput } from '@nanny-app/shared';

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
import { deletePackage, updatePackage } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { formatDateTime, formatEgp } from '@admin/lib/format';

type PackageTableProps = {
  packages: Package[];
};

/** An ISO datetime (or null) → a `<input type="date">` value (YYYY-MM-DD). */
function isoToDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

/** A `<input type="date">` value → an ISO 8601 datetime, or null when cleared. */
function dateInputToIso(value: string): string | null {
  return value ? `${value}T00:00:00.000Z` : null;
}

export function PackageTable({ packages }: PackageTableProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Package | null>(null);
  const [deleting, setDeleting] = useState<Package | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['packages'] });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdatePackageInput }) =>
      updatePackage(id, input),
    onSuccess: (updated) => {
      invalidate();
      setEditing(null);
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

  const columns: Column<Package>[] = [
    { key: 'name', header: 'Name', render: (pkg) => pkg.name },
    { key: 'hours', header: 'Hours', render: (pkg) => `${pkg.hours} h` },
    { key: 'price', header: 'Price', render: (pkg) => formatEgp(pkg.price) },
    {
      key: 'expiresAt',
      header: 'Expires',
      render: (pkg) =>
        pkg.expiresAt ? (
          formatDateTime(pkg.expiresAt)
        ) : (
          <span className="table-empty">Never</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (pkg) => (
        <Badge tone={pkg.isActive ? 'success' : 'neutral'}>
          {pkg.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (pkg) => (
        <ActionMenu label={`Actions for ${pkg.name}`}>
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
      ),
    },
  ];

  return (
    <>
      <Table
        columns={columns}
        rows={packages}
        rowKey={(pkg) => pkg.id}
        empty="No packages yet — create the first one above."
      />

      {editing && (
        <PackageEditModal
          package={editing}
          busy={updateMutation.isPending}
          onCancel={() => setEditing(null)}
          onSave={(input) => updateMutation.mutate({ id: editing.id, input })}
        />
      )}

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

function PackageEditModal({
  package: pkg,
  busy,
  onCancel,
  onSave,
}: {
  package: Package;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: UpdatePackageInput) => void;
}) {
  const [name, setName] = useState(pkg.name);
  const [description, setDescription] = useState(pkg.description ?? '');
  const [hours, setHours] = useState(String(pkg.hours));
  const [price, setPrice] = useState(String(pkg.price));
  const [expiresAt, setExpiresAt] = useState(isoToDateInput(pkg.expiresAt));
  const canSave =
    !busy && name.trim().length > 0 && Number(hours) >= 1 && Number(price) > 0;

  return (
    <Modal
      title="Edit package"
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={!canSave}
            onClick={() =>
              onSave({
                name: name.trim(),
                description: description.trim() || undefined,
                hours: Number(hours),
                price: Number(price),
                expiresAt: dateInputToIso(expiresAt),
              })
            }
          >
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="modal-field field">
        <label className="field-label" htmlFor="package-name">
          Name
        </label>
        <input
          id="package-name"
          className="input"
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="modal-field field">
        <label className="field-label" htmlFor="package-description">
          Description
        </label>
        <input
          id="package-description"
          className="input"
          value={description}
          placeholder="Optional — shown to admins only"
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="modal-field field">
        <label className="field-label" htmlFor="package-hours">
          Hours
        </label>
        <input
          id="package-hours"
          className="input"
          type="number"
          min={1}
          step={1}
          value={hours}
          onChange={(event) => setHours(event.target.value)}
        />
      </div>
      <div className="modal-field field">
        <label className="field-label" htmlFor="package-price">
          Price (EGP)
        </label>
        <input
          id="package-price"
          className="input"
          type="number"
          min={0}
          step="0.01"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
        />
      </div>
      <div className="modal-field field">
        <label className="field-label" htmlFor="package-expires">
          Expires at
        </label>
        <input
          id="package-expires"
          className="input"
          type="date"
          value={expiresAt}
          onChange={(event) => setExpiresAt(event.target.value)}
        />
        <span className="field-hint">Leave blank for a package that never expires.</span>
      </div>
    </Modal>
  );
}
