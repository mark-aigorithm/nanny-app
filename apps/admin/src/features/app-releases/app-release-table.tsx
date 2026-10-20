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
  idColumn,
  MenuItem,
  MenuSeparator,
  Pencil,
  Table,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { AppReleaseFormModal, PLATFORM_LABELS } from '@admin/features/app-releases/app-release-form';
import { platformReleaseState } from '@admin/features/app-releases/release-status';
import { deleteAppRelease } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { formatDate } from '@admin/lib/format';
import { useCanManage } from '@admin/lib/permissions';
import { useClientSort, type SortAccessors } from '@admin/lib/use-table-sort';

/** iOS first, then newest version first — by semver, so 1.10.0 sits above 1.9.0. */
export function sortReleases(releases: AppRelease[]): AppRelease[] {
  return [...releases].sort(
    (a, b) => a.platform.localeCompare(b.platform) * -1 || (compareVersions(b.version, a.version) ?? 0),
  );
}

type ReleaseSortKey = 'id' | 'platform' | 'version' | 'mandatory' | 'createdAt';

// Versions compare digit-run by digit-run (numeric collation), so 1.10.0 sorts above 1.9.0.
const ACCESSORS: SortAccessors<AppRelease, ReleaseSortKey> = {
  id: (r) => r.id,
  platform: (r) => PLATFORM_LABELS[r.platform],
  version: (r) => r.version,
  mandatory: (r) => (r.mandatory ? 1 : 0),
  createdAt: (r) => r.createdAt,
};

type AppReleaseTableProps = { releases: AppRelease[] };

export function AppReleaseTable({ releases }: AppReleaseTableProps) {
  const canManage = useCanManage('settings');
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<AppRelease | null>(null);
  const [deleting, setDeleting] = useState<AppRelease | null>(null);
  // Default order: iOS first, newest version first. A header click re-sorts
  // that list (stably, so ties keep this order).
  const ordered = useMemo(() => sortReleases(releases), [releases]);
  const { rows = [], sort, onSortChange } = useClientSort<AppRelease, ReleaseSortKey>(ordered, ACCESSORS, { sortBy: 'platform', sortDir: 'desc' });

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
  // The rows that set each platform's current state, tagged in the history.
  const current = useMemo(() => {
    const ids = { latest: new Set<number>(), minimum: new Set<number>() };
    for (const platform of ['ios', 'android'] as const) {
      const { latest, minimum } = platformReleaseState(releases, platform);
      if (latest) ids.latest.add(latest.id);
      if (minimum) ids.minimum.add(minimum.id);
    }
    return ids;
  }, [releases]);

  const columns: Column<AppRelease, ReleaseSortKey>[] = [
    idColumn((r) => r.id, 'id'),
    { key: 'platform', header: 'Platform', sortKey: 'platform', render: (r) => PLATFORM_LABELS[r.platform] },
    {
      key: 'version',
      header: 'Version',
      sortKey: 'version',
      sortFirst: 'desc',
      nowrap: true,
      render: (r) => (
        <span className="release-version-cell">
          {r.version}
          {current.latest.has(r.id) && <Badge tone="success">Latest</Badge>}
          {current.minimum.has(r.id) && <Badge tone="warning">Minimum</Badge>}
        </span>
      ),
    },
    {
      key: 'mandatory',
      header: 'Enforcement',
      sortKey: 'mandatory',
      sortFirst: 'desc',
      render: (r) => (
        // A deliberate setting, not an error: warning, not danger.
        <Badge tone={r.mandatory ? 'warning' : 'neutral'}>{r.mandatory ? 'Mandatory' : 'Optional'}</Badge>
      ),
    },
    {
      key: 'notes',
      header: 'Release notes',
      render: (r) => r.releaseNotes ?? <span className="table-empty">—</span>,
    },
    {
      key: 'createdAt',
      header: 'Recorded',
      sortKey: 'createdAt',
      sortFirst: 'desc',
      nowrap: true,
      render: (r) => formatDate(r.createdAt),
    },
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
        sort={sort}
        onSortChange={onSortChange}
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
