import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ChangeEvent } from 'react';

import {
  CAMPAIGN_IMAGE_HEIGHT,
  CAMPAIGN_IMAGE_WIDTH,
  CreateCampaignSchema,
  UpdateCampaignSchema,
  type Campaign,
  type CampaignTargetType,
} from '@nanny-app/shared';

import { Field, FormModal, Input, Select, useToast } from '@admin/components/ui';
import { createCampaign, fetchPackages, fetchPromoCodes, updateCampaign } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { CampaignImageCropper } from '@admin/features/campaigns/campaign-image-cropper';
import { cropImageToFile, type PixelArea } from '@admin/lib/crop-image';
import { firstIssueMessage } from '@admin/lib/form-errors';
import { uploadImageToFirebase } from '@admin/lib/storage';

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
 *  or null when cleared. */
function dateTimeLocalToIso(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

type CampaignFormModalProps = {
  /** The campaign to edit; omit to create a new one. */
  campaign?: Campaign;
  onClose: () => void;
};

/** Create a campaign, or edit one — the Campaigns page's one dialog for both. */
export function CampaignFormModal({ campaign, onClose }: CampaignFormModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const packages = useQuery({ queryKey: ['packages'], queryFn: fetchPackages });
  const promoCodes = useQuery({ queryKey: ['promo-codes'], queryFn: fetchPromoCodes });

  const [title, setTitle] = useState(campaign?.title ?? '');
  const [subtitle, setSubtitle] = useState(campaign?.subtitle ?? '');
  const [imageUrl, setImageUrl] = useState(campaign?.imageUrl ?? '');
  const [uploading, setUploading] = useState(false);
  // A picked file waiting to be framed: its object URL and original name.
  const [pending, setPending] = useState<{ src: string; name: string } | null>(null);
  const [targetType, setTargetType] = useState<CampaignTargetType>(
    campaign?.targetType ?? 'PACKAGE',
  );
  const [packageId, setPackageId] = useState<number | null>(campaign?.packageId ?? null);
  const [promoCodeId, setPromoCodeId] = useState<number | null>(campaign?.promoCodeId ?? null);
  const [startsAt, setStartsAt] = useState(isoToDateTimeLocal(campaign?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(isoToDateTimeLocal(campaign?.endsAt ?? null));
  const [sortOrder, setSortOrder] = useState(campaign ? String(campaign.sortOrder) : '0');
  const [isActive, setIsActive] = useState(campaign?.isActive ?? true);
  const [formError, setFormError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (save: () => Promise<Campaign>) => save(),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success(campaign ? 'Campaign updated' : 'Campaign created', saved.title);
      onClose();
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so picking the same file again still fires a change.
    event.target.value = '';
    if (!file) return;
    setFormError(null);
    setPending({ src: URL.createObjectURL(file), name: file.name });
  }

  function discardPending() {
    if (pending) URL.revokeObjectURL(pending.src);
    setPending(null);
  }

  async function handleCropConfirm(area: PixelArea) {
    if (!pending) return;
    setUploading(true);
    setFormError(null);
    try {
      const file = await cropImageToFile(
        pending.src,
        area,
        CAMPAIGN_IMAGE_WIDTH,
        CAMPAIGN_IMAGE_HEIGHT,
        pending.name,
      );
      const url = await uploadImageToFirebase(file, 'campaigns');
      setImageUrl(url);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploading(false);
      discardPending();
    }
  }

  function submit() {
    setFormError(null);
    const target = {
      targetType,
      packageId: targetType === 'PACKAGE' ? (packageId ?? undefined) : undefined,
      promoCodeId: targetType === 'PROMO_CODE' ? (promoCodeId ?? undefined) : undefined,
    };
    if (campaign) {
      // Every field is sent, and an emptied subtitle or date is cleared (null).
      const parsed = UpdateCampaignSchema.safeParse({
        title: title.trim(),
        subtitle: subtitle.trim() ? subtitle.trim() : null,
        imageUrl,
        ...target,
        startsAt: dateTimeLocalToIso(startsAt),
        endsAt: dateTimeLocalToIso(endsAt),
        sortOrder: Number(sortOrder) || 0,
        isActive,
      });
      if (!parsed.success) return setFormError(firstIssueMessage(parsed.error));
      saveMutation.mutate(() => updateCampaign(campaign.id, parsed.data));
    } else {
      const parsed = CreateCampaignSchema.safeParse({
        title: title.trim(),
        subtitle: subtitle.trim() ? subtitle.trim() : undefined,
        imageUrl,
        ...target,
        startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
        endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
        sortOrder: Number(sortOrder) || 0,
        isActive,
      });
      if (!parsed.success) return setFormError(firstIssueMessage(parsed.error));
      saveMutation.mutate(() => createCampaign(parsed.data));
    }
  }

  const packageOptions = (packages.data ?? []).map((p) => ({ value: p.id, label: p.name }));
  const imageHint = `${campaign ? 'Upload to replace the current image.' : 'Required.'} You'll crop it to the Home-screen banner shape (16:9).`;
  const promoOptions = (promoCodes.data ?? []).map((c) => ({ value: c.id, label: c.code }));

  return (
    <FormModal
      title={campaign ? 'Edit campaign' : 'Add campaign'}
      submitLabel={uploading ? 'Uploading…' : campaign ? 'Save changes' : 'Add campaign'}
      busy={saveMutation.isPending}
      submitDisabled={uploading || pending !== null || !imageUrl || title.trim() === ''}
      error={formError}
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="form-grid">
        <Field label="Title">
          <Input
            value={title}
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Summer sale"
            required
          />
        </Field>
        <Field label="Subtitle" hint="Optional line under the title.">
          <Input
            value={subtitle}
            onChange={(event) => setSubtitle(event.target.value)}
            placeholder="Save on prepaid hours"
          />
        </Field>
        {pending ? (
          // Not a <Field>: that renders a <label>, which would rename the cropper's first
          // button and forward clicks on the crop stage to it (i.e. Cancel).
          <div className="field">
            <span className="field-label">Image</span>
            <CampaignImageCropper
              src={pending.src}
              busy={uploading}
              onCancel={discardPending}
              onConfirm={(area) => void handleCropConfirm(area)}
            />
            <span className="field-hint">{imageHint}</span>
          </div>
        ) : (
          <Field label="Image" hint={imageHint}>
            <Input type="file" accept="image/*" onChange={handleImage} />
          </Field>
        )}
        {imageUrl && (
          <div className="field">
            <span className="field-label">Preview (as shown in the app)</span>
            <img
              src={imageUrl}
              alt="Campaign preview"
              style={{
                width: 240,
                aspectRatio: `${CAMPAIGN_IMAGE_WIDTH} / ${CAMPAIGN_IMAGE_HEIGHT}`,
                objectFit: 'cover',
                borderRadius: 8,
              }}
            />
          </div>
        )}
        <Field label="Links to">
          <Select
            value={targetType}
            options={[
              { value: 'PACKAGE', label: 'Package' },
              { value: 'PROMO_CODE', label: 'Promo code' },
            ]}
            onChange={(value) => setTargetType(value as CampaignTargetType)}
          />
        </Field>
        {targetType === 'PACKAGE' ? (
          <Field label="Package">
            <Select<number>
              value={packageId ?? 0}
              options={[{ value: 0, label: 'Select a package…' }, ...packageOptions]}
              onChange={(value) => setPackageId(value === 0 ? null : value)}
            />
          </Field>
        ) : (
          <Field label="Promo code">
            <Select<number>
              value={promoCodeId ?? 0}
              options={[{ value: 0, label: 'Select a promo code…' }, ...promoOptions]}
              onChange={(value) => setPromoCodeId(value === 0 ? null : value)}
            />
          </Field>
        )}
        <Field label="Starts at" hint="Optional. Leave empty to start immediately.">
          <Input
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
          />
        </Field>
        <Field label="Ends at" hint="Optional. Leave empty for no end date.">
          <Input
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
          />
        </Field>
        <Field label="Sort order" hint="Lower shows first in the carousel.">
          <Input
            type="number"
            min="0"
            step="1"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
          />
        </Field>
        <Field label="Status">
          <Select
            value={isActive ? 'active' : 'paused'}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'paused', label: 'Paused' },
            ]}
            onChange={(value) => setIsActive(value === 'active')}
          />
        </Field>
      </div>
    </FormModal>
  );
}
