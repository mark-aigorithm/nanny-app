import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { Campaign } from '@nanny-app/shared';

import {
  ActionMenu,
  actionsColumn,
  Badge,
  Check,
  type Column,
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
import { CampaignFormModal } from '@admin/features/campaigns/campaign-form';
import { deleteCampaign, updateCampaign } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';
import { useClientSort } from '@admin/lib/use-table-sort';

type CampaignSortKey = 'order' | 'title' | 'target' | 'status' | 'impressions' | 'taps' | 'usage';

type CampaignTableProps = {
  campaigns: Campaign[];
};

type Status = { label: string; tone: 'success' | 'neutral' | 'warning'; rank: number };

function campaignStatus(c: Campaign): Status {
  if (!c.isActive) return { label: 'Off', tone: 'neutral', rank: 3 };
  const now = Date.now();
  if (c.startsAt && new Date(c.startsAt).getTime() > now)
    return { label: 'Scheduled', tone: 'warning', rank: 1 };
  if (c.endsAt && new Date(c.endsAt).getTime() < now)
    return { label: 'Expired', tone: 'neutral', rank: 2 };
  return { label: 'Active', tone: 'success', rank: 0 };
}

export function CampaignTable({ campaigns }: CampaignTableProps) {
  const canManage = useCanManage('campaigns');
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [deleting, setDeleting] = useState<Campaign | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['campaigns'] });

  // The API lists campaigns in carousel order (sort order, then oldest first),
  // so that is the default — a stable sort keeps the API's tiebreak.
  const { rows, sort, onSortChange } = useClientSort<Campaign, CampaignSortKey>(
    campaigns,
    {
      order: (c) => c.sortOrder,
      title: (c) => c.title,
      target: (c) => `${c.targetType === 'PACKAGE' ? 'Package' : 'Promo'} ${c.targetName}`,
      status: (c) => campaignStatus(c).rank,
      impressions: (c) => c.impressionCount,
      taps: (c) => c.clickCount,
      usage: (c) => c.targetUsageCount,
    },
    { sortBy: 'order', sortDir: 'asc' },
  );

  const toggleMutation = useMutation({
    mutationFn: (c: Campaign) => updateCampaign(c.id, { isActive: !c.isActive }),
    onSuccess: (updated) => {
      invalidate();
      toast.success(updated.isActive ? 'Campaign activated' : 'Campaign paused', updated.title);
    },
    onError: (err) => toast.error('Couldn’t update campaign', apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCampaign,
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast.success('Campaign deleted');
    },
    onError: (err) => toast.error('Couldn’t delete campaign', apiErrorMessage(err)),
  });

  const columns: Column<Campaign, CampaignSortKey>[] = [
    {
      key: 'image',
      header: <span className="sr-only">Image</span>,
      render: (c) => (
        <img
          src={c.imageUrl}
          alt=""
          style={{ width: 48, height: 32, objectFit: 'cover', borderRadius: 6 }}
        />
      ),
    },
    { key: 'order', header: 'Order', align: 'right', sortKey: 'order', render: (c) => c.sortOrder },
    { key: 'title', header: 'Title', sortKey: 'title', render: (c) => c.title },
    {
      key: 'target',
      header: 'Target',
      sortKey: 'target',
      render: (c) => (
        <span>
          <Badge tone="neutral">{c.targetType === 'PACKAGE' ? 'Package' : 'Promo'}</Badge>{' '}
          {c.targetName}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (c) => {
        const s = campaignStatus(c);
        return <Badge tone={s.tone}>{s.label}</Badge>;
      },
    },
    {
      key: 'impressions',
      header: 'Impressions',
      align: 'right',
      sortKey: 'impressions',
      sortFirst: 'desc',
      render: (c) => c.impressionCount,
    },
    {
      key: 'taps',
      header: 'Taps',
      align: 'right',
      sortKey: 'taps',
      sortFirst: 'desc',
      render: (c) => c.clickCount,
    },
    {
      key: 'usage',
      header: 'Total usage',
      align: 'right',
      sortKey: 'usage',
      sortFirst: 'desc',
      render: (c) => c.targetUsageCount,
    },
    actionsColumn((c) => (
      <ActionMenu label={`Actions for campaign ${c.title}`} disabled={!canManage}>
        <MenuItem icon={<Pencil size={ICON_SIZE.menu} />} onSelect={() => setEditing(c)}>
          Edit
        </MenuItem>
        <MenuItem
          icon={c.isActive ? <Power size={ICON_SIZE.menu} /> : <Check size={ICON_SIZE.menu} />}
          disabled={toggleMutation.isPending}
          onSelect={() => toggleMutation.mutate(c)}
        >
          {c.isActive ? 'Pause' : 'Activate'}
        </MenuItem>
        <MenuSeparator />
        <MenuItem danger icon={<Trash2 size={ICON_SIZE.menu} />} onSelect={() => setDeleting(c)}>
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
        rowKey={(c) => c.id}
        empty="No campaigns yet — add the first one with “Add campaign”."
        sort={sort}
        onSortChange={onSortChange}
      />

      {editing && <CampaignFormModal campaign={editing} onClose={() => setEditing(null)} />}

      {deleting && (
        <ConfirmDialog
          title="Delete campaign"
          message={`Delete “${deleting.title}”? It will disappear from the app carousel. This can’t be undone.`}
          confirmLabel="Delete campaign"
          danger
          busy={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
