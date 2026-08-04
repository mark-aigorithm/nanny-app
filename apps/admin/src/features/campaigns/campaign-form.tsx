import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ChangeEvent, type FormEvent } from 'react';

import { CreateCampaignSchema, type CampaignTargetType } from '@nanny-app/shared';

import { Button, Card, Feedback, Field, Select } from '@admin/components/ui';
import { createCampaign, fetchPackages, fetchPromoCodes } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { uploadImageToFirebase } from '@admin/lib/storage';

export function CampaignForm() {
  const queryClient = useQueryClient();
  const packages = useQuery({ queryKey: ['packages'], queryFn: fetchPackages });
  const promoCodes = useQuery({ queryKey: ['promo-codes'], queryFn: fetchPromoCodes });

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [targetType, setTargetType] = useState<CampaignTargetType>('PACKAGE');
  const [packageId, setPackageId] = useState<number | null>(null);
  const [promoCodeId, setPromoCodeId] = useState<number | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createCampaign,
    onSuccess: () => {
      setTitle('');
      setSubtitle('');
      setImageUrl('');
      setPackageId(null);
      setPromoCodeId(null);
      setStartsAt('');
      setEndsAt('');
      setSortOrder('0');
      setIsActive(true);
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  async function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setFormError(null);
    try {
      const url = await uploadImageToFirebase(file, 'campaigns');
      setImageUrl(url);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = CreateCampaignSchema.safeParse({
      title: title.trim(),
      subtitle: subtitle.trim() ? subtitle.trim() : undefined,
      imageUrl,
      targetType,
      packageId: targetType === 'PACKAGE' ? packageId ?? undefined : undefined,
      promoCodeId: targetType === 'PROMO_CODE' ? promoCodeId ?? undefined : undefined,
      startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
      endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
      sortOrder: Number(sortOrder) || 0,
      isActive,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFormError(issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid input');
      return;
    }
    createMutation.mutate(parsed.data);
  }

  const packageOptions = (packages.data ?? []).map((p) => ({ value: p.id, label: p.name }));
  const promoOptions = (promoCodes.data ?? []).map((c) => ({ value: c.id, label: c.code }));

  return (
    <Card title="Create campaign">
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Summer sale" required />
          </Field>
          <Field label="Subtitle" hint="Optional line under the title.">
            <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Save on prepaid hours" />
          </Field>
          <Field label="Image" hint="Required. Uploaded to Firebase Storage.">
            <input type="file" accept="image/*" onChange={handleImage} />
          </Field>
          {imageUrl && (
            <div className="field">
              <span className="field-label">Preview</span>
              <img src={imageUrl} alt="Campaign preview" style={{ maxWidth: 160, borderRadius: 8 }} />
            </div>
          )}
          <div className="field">
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
            <div className="field">
              <span className="field-label">Package</span>
              <Select<number>
                value={packageId ?? 0}
                options={[{ value: 0, label: 'Select a package…' }, ...packageOptions]}
                onChange={(value) => setPackageId(value === 0 ? null : value)}
              />
            </div>
          ) : (
            <div className="field">
              <span className="field-label">Promo code</span>
              <Select<number>
                value={promoCodeId ?? 0}
                options={[{ value: 0, label: 'Select a promo code…' }, ...promoOptions]}
                onChange={(value) => setPromoCodeId(value === 0 ? null : value)}
              />
            </div>
          )}
          <Field label="Starts at" hint="Optional. Leave empty to start immediately.">
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label="Ends at" hint="Optional. Leave empty for no end date.">
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
          <Field label="Sort order" hint="Lower shows first in the carousel.">
            <input type="number" min="0" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </Field>
          <div className="field">
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
        </div>
        {formError && <Feedback tone="error">{formError}</Feedback>}
        <Button type="submit" disabled={createMutation.isPending || uploading || !imageUrl}>
          {uploading ? 'Uploading…' : createMutation.isPending ? 'Creating…' : 'Create campaign'}
        </Button>
      </form>
    </Card>
  );
}
