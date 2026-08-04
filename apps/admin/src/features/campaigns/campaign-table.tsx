import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { Campaign } from '@nanny-app/shared';

import {
  ActionMenu,
  Badge,
  Check,
  type Column,
  ConfirmDialog,
  ICON_SIZE,
  MenuItem,
  MenuSeparator,
  Power,
  Table,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { deleteCampaign, updateCampaign } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

type CampaignTableProps = {
  campaigns: Campaign[];
};

type Status = { label: string; tone: 'success' | 'neutral' | 'warning' };

function campaignStatus(c: Campaign): Status {
  if (!c.isActive) return { label: 'Off', tone: 'neutral' };
  const now = Date.now();
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return { label: 'Scheduled', tone: 'warning' };
  if (c.endsAt && new Date(c.endsAt).getTime() < now) return { label: 'Expired', tone: 'neutral' };
  return { label: 'Active', tone: 'success' };
}

export function CampaignTable({ campaigns }: CampaignTableProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [deleting, setDeleting] = useState<Campaign | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['campaigns'] });

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

  const columns: Column<Campaign>[] = [
    {
      key: 'image',
      header: '',
      render: (c) => (
        <img src={c.imageUrl} alt="" style={{ width: 48, height: 32, objectFit: 'cover', borderRadius: 6 }} />
      ),
    },
    { key: 'title', header: 'Title', render: (c) => c.title },
    {
      key: 'target',
      header: 'Target',
      render: (c) => (
        <span>
          <Badge tone="neutral">{c.targetType === 'PACKAGE' ? 'Package' : 'Promo'}</Badge> {c.targetName}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => {
        const s = campaignStatus(c);
        return <Badge tone={s.tone}>{s.label}</Badge>;
      },
    },
    { key: 'impressions', header: 'Impressions', align: 'right', render: (c) => c.impressionCount },
    { key: 'taps', header: 'Taps', align: 'right', render: (c) => c.clickCount },
    { key: 'usage', header: 'Total usage', align: 'right', render: (c) => c.targetUsageCount },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) => (
        <ActionMenu label={`Actions for campaign ${c.title}`}>
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
      ),
    },
  ];

  return (
    <>
      <Table
        columns={columns}
        rows={campaigns}
        rowKey={(c) => c.id}
        empty="No campaigns yet — create the first one above."
      />

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
