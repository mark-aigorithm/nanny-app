import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ChangeEvent } from 'react';

import type { Campaign, CampaignTargetType, UpdateCampaignInput } from '@nanny-app/shared';

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
  Select,
  Table,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { deleteCampaign, fetchPackages, fetchPromoCodes, updateCampaign } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';
import { uploadImageToFirebase } from '@admin/lib/storage';

type CampaignTableProps = {
  campaigns: Campaign[];
};

/** A stored UTC ISO datetime (or null) → a `<input type="datetime-local">` value in the
 *  browser's LOCAL wall-clock (YYYY-MM-DDTHH:mm), so it round-trips losslessly through
 *  dateTimeLocalToIso (which parses the value as local). */
function isoToDateTimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A `<input type="datetime-local">` value (local wall-clock) → an ISO 8601 UTC datetime,
 *  or null when cleared. Matches how the create form interprets the same input. */
function dateTimeLocalToIso(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

type Status = { label: string; tone: 'success' | 'neutral' | 'warning' };

function campaignStatus(c: Campaign): Status {
  if (!c.isActive) return { label: 'Off', tone: 'neutral' };
  const now = Date.now();
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return { label: 'Scheduled', tone: 'warning' };
  if (c.endsAt && new Date(c.endsAt).getTime() < now) return { label: 'Expired', tone: 'neutral' };
  return { label: 'Active', tone: 'success' };
}

export function CampaignTable({ campaigns }: CampaignTableProps) {
  const canManage = useCanManage('campaigns');
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [deleting, setDeleting] = useState<Campaign | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['campaigns'] });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateCampaignInput }) =>
      updateCampaign(id, input),
    onSuccess: (updated) => {
      invalidate();
      setEditing(null);
      toast.success('Campaign updated', updated.title);
    },
    onError: (err) => toast.error('Couldn’t update campaign', apiErrorMessage(err)),
  });

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

      {editing && (
        <CampaignEditModal
          campaign={editing}
          busy={updateMutation.isPending}
          onCancel={() => setEditing(null)}
          onSave={(input) => updateMutation.mutate({ id: editing.id, input })}
        />
      )}

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

function CampaignEditModal({
  campaign,
  busy,
  onCancel,
  onSave,
}: {
  campaign: Campaign;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: UpdateCampaignInput) => void;
}) {
  const packages = useQuery({ queryKey: ['packages'], queryFn: fetchPackages });
  const promoCodes = useQuery({ queryKey: ['promo-codes'], queryFn: fetchPromoCodes });

  const [title, setTitle] = useState(campaign.title);
  const [subtitle, setSubtitle] = useState(campaign.subtitle ?? '');
  const [imageUrl, setImageUrl] = useState(campaign.imageUrl);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<CampaignTargetType>(campaign.targetType);
  const [packageId, setPackageId] = useState<number | null>(campaign.packageId);
  const [promoCodeId, setPromoCodeId] = useState<number | null>(campaign.promoCodeId);
  const [startsAt, setStartsAt] = useState(isoToDateTimeLocal(campaign.startsAt));
  const [endsAt, setEndsAt] = useState(isoToDateTimeLocal(campaign.endsAt));
  const [sortOrder, setSortOrder] = useState(String(campaign.sortOrder));
  const [isActive, setIsActive] = useState(campaign.isActive);

  async function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadImageToFirebase(file, 'campaigns');
      setImageUrl(url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploading(false);
    }
  }

  const targetId = targetType === 'PACKAGE' ? packageId : promoCodeId;
  const canSave =
    !busy && !uploading && title.trim().length > 0 && !!imageUrl && targetId != null;

  const packageOptions = (packages.data ?? []).map((p) => ({ value: p.id, label: p.name }));
  const promoOptions = (promoCodes.data ?? []).map((c) => ({ value: c.id, label: c.code }));

  return (
    <Modal
      title="Edit campaign"
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
                title: title.trim(),
                subtitle: subtitle.trim() ? subtitle.trim() : null,
                imageUrl,
                targetType,
                packageId: targetType === 'PACKAGE' ? packageId ?? undefined : undefined,
                promoCodeId: targetType === 'PROMO_CODE' ? promoCodeId ?? undefined : undefined,
                startsAt: dateTimeLocalToIso(startsAt),
                endsAt: dateTimeLocalToIso(endsAt),
                sortOrder: Number(sortOrder) || 0,
                isActive,
              })
            }
          >
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="modal-field field">
        <label className="field-label" htmlFor="campaign-title">
          Title
        </label>
        <input
          id="campaign-title"
          className="input"
          value={title}
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="modal-field field">
        <label className="field-label" htmlFor="campaign-subtitle">
          Subtitle
        </label>
        <input
          id="campaign-subtitle"
          className="input"
          value={subtitle}
          placeholder="Optional line under the title"
          onChange={(event) => setSubtitle(event.target.value)}
        />
      </div>
      <div className="modal-field field">
        <label className="field-label" htmlFor="campaign-image">
          Image
        </label>
        {imageUrl && (
          <img
            src={imageUrl}
            alt="Campaign"
            style={{ maxWidth: 160, borderRadius: 8, marginBottom: 8 }}
          />
        )}
        <input id="campaign-image" className="input" type="file" accept="image/*" onChange={handleImage} />
        <span className="field-hint">Upload to replace the current image.</span>
        {uploadError && <span className="field-hint">{uploadError}</span>}
      </div>
      <div className="modal-field field">
        <span className="field-label">Links to</span>
        <Select
          value={targetType}
          options={[
            { value: 'PACKAGE', label: 'Package' },
            { value: 'PROMO_CODE', label: 'Promo code' },
          ]}
          onChange={(value) => setTargetType(value as CampaignTargetType)}
        />
      </div>
      {targetType === 'PACKAGE' ? (
        <div className="modal-field field">
          <span className="field-label">Package</span>
          <Select<number>
            value={packageId ?? 0}
            options={[{ value: 0, label: 'Select a package…' }, ...packageOptions]}
            onChange={(value) => setPackageId(value === 0 ? null : value)}
          />
        </div>
      ) : (
        <div className="modal-field field">
          <span className="field-label">Promo code</span>
          <Select<number>
            value={promoCodeId ?? 0}
            options={[{ value: 0, label: 'Select a promo code…' }, ...promoOptions]}
            onChange={(value) => setPromoCodeId(value === 0 ? null : value)}
          />
        </div>
      )}
      <div className="modal-field field">
        <label className="field-label" htmlFor="campaign-starts">
          Starts at
        </label>
        <input
          id="campaign-starts"
          className="input"
          type="datetime-local"
          value={startsAt}
          onChange={(event) => setStartsAt(event.target.value)}
        />
        <span className="field-hint">Leave blank to start immediately.</span>
      </div>
      <div className="modal-field field">
        <label className="field-label" htmlFor="campaign-ends">
          Ends at
        </label>
        <input
          id="campaign-ends"
          className="input"
          type="datetime-local"
          value={endsAt}
          onChange={(event) => setEndsAt(event.target.value)}
        />
        <span className="field-hint">Leave blank for no end date.</span>
      </div>
      <div className="modal-field field">
        <label className="field-label" htmlFor="campaign-sort">
          Sort order
        </label>
        <input
          id="campaign-sort"
          className="input"
          type="number"
          min={0}
          step={1}
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value)}
        />
        <span className="field-hint">Lower shows first in the carousel.</span>
      </div>
      <div className="modal-field field">
        <span className="field-label">Status</span>
        <Select
          value={isActive ? 'active' : 'paused'}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'paused', label: 'Paused' },
          ]}
          onChange={(value) => setIsActive(value === 'active')}
        />
      </div>
    </Modal>
  );
}
