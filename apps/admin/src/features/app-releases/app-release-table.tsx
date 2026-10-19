import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { compareVersions, type AppRelease } from '@nanny-app/shared';

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
import { AppReleaseFormModal, PLATFORM_LABELS } from '@admin/features/app-releases/app-release-form';
import { deleteAppRelease } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

/** iOS first, then newest version first — by semver, so 1.10.0 sits above 1.9.0. */
export function sortReleases(releases: AppRelease[]): AppRelease[] {
  return [...releases].sort(
    (a, b) => a.platform.localeCompare(b.platform) * -1 || (compareVersions(b.version, a.version) ?? 0),
  );
}

type AppReleaseTableProps = { releases: AppRelease[] };

export function AppReleaseTable({ releases }: AppReleaseTableProps) {
  const canManage = useCanManage('settings');
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<AppRelease | null>(null);
  const [deleting, setDeleting] = useState<AppRelease | null>(null);
  const rows = useMemo(() => sortReleases(releases), [releases]);

  const deleteMutation = useMutation({
    mutationFn: deleteAppRelease,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['app-releases'] });
      setDeleting(null);
      toast.success('Release deleted');
    },
    onError: (err) => toast.error('Couldn’t delete release', apiErrorMessage(err)),
  });

  const label = (r: AppRelease) => `${PLATFORM_LABELS[r.platform]} ${r.version}`;

  const columns: Column<AppRelease>[] = [
    { key: 'platform', header: 'Platform', render: (r) => PLATFORM_LABELS[r.platform] },
    { key: 'version', header: 'Version', render: (r) => r.version },
    {
      key: 'mandatory',
      header: 'Enforcement',
      render: (r) => (
        <Badge tone={r.mandatory ? 'danger' : 'neutral'}>{r.mandatory ? 'Mandatory' : 'Optional'}</Badge>
      ),
    },
    {
      key: 'notes',
      header: 'Release notes',
      render: (r) => r.releaseNotes ?? <span className="table-empty">—</span>,
    },
    { key: 'createdAt', header: 'Recorded', render: (r) => new Date(r.createdAt).toLocaleDateString() },
    actionsColumn((r) => (
      <ActionMenu label={`Actions for ${label(r)}`} disabled={!canManage}>
        <MenuItem icon={<Pencil size={ICON_SIZE.menu} />} onSelect={() => setEditing(r)}>
          Edit
        </MenuItem>
        <MenuSeparator />
        <MenuItem danger icon={<Trash2 size={ICON_SIZE.menu} />} onSelect={() => setDeleting(r)}>
          Delete
        </MenuItem>
      </ActionMenu>
    )),
  ];

  return (
    <>
      <Table
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty="No releases recorded — the app never prompts to update until you add one."
      />
      {editing && <AppReleaseFormModal release={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete release"
          message={`Delete ${label(deleting)}? If it was mandatory, older installs stop being blocked.`}
          confirmLabel="Delete release"
          danger
          busy={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
