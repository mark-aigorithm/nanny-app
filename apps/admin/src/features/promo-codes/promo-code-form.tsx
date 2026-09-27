import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  CreatePromoCodeSchema,
  UpdatePromoCodeSchema,
  type DiscountType,
  type PromoCode,
} from '@nanny-app/shared';

import { Field, FormModal, Input, Select, useToast } from '@admin/components/ui';
import { createPromoCode, updatePromoCode } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { firstIssueMessage } from '@admin/lib/form-errors';

/** A stored UTC ISO datetime (or null) → a `<input type="datetime-local">` value in the
 *  browser's local wall-clock, so it round-trips through `new Date(value)` on save. */
function isoToDateTimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type PromoCodeFormModalProps = {
  /** The promo code to edit; omit to create a new one. */
  promoCode?: PromoCode;
  onClose: () => void;
};

/** Create a promo code, or edit one — the Promo Codes page's one dialog for both. */
export function PromoCodeFormModal({ promoCode, onClose }: PromoCodeFormModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [code, setCode] = useState(promoCode?.code ?? '');
  const [discountType, setDiscountType] = useState<DiscountType>(
    promoCode?.discountType ?? 'PERCENTAGE',
  );
  const [value, setValue] = useState(promoCode ? String(promoCode.value) : '');
  const [maxUsage, setMaxUsage] = useState(
    promoCode?.maxUsage != null ? String(promoCode.maxUsage) : '',
  );
  const [maxUsagePerUser, setMaxUsagePerUser] = useState(
    promoCode?.maxUsagePerUser != null ? String(promoCode.maxUsagePerUser) : '',
  );
  const [expiresAt, setExpiresAt] = useState(isoToDateTimeLocal(promoCode?.expiresAt ?? null));
  const [isActive, setIsActive] = useState(promoCode?.isActive ?? true);
  const [formError, setFormError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (save: () => Promise<PromoCode>) => save(),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['promo-codes'] });
      toast.success(promoCode ? 'Promo code updated' : 'Promo code created', saved.code);
      onClose();
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  function submit() {
    setFormError(null);
    if (promoCode) {
      // The code itself is fixed once created; everything else can change, and an
      // emptied limit or expiry is cleared (null) rather than left as it was.
      const parsed = UpdatePromoCodeSchema.safeParse({
        discountType,
        value: Number(value),
        maxUsage: maxUsage ? Number(maxUsage) : null,
        maxUsagePerUser: maxUsagePerUser ? Number(maxUsagePerUser) : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        isActive,
      });
      if (!parsed.success) return setFormError(firstIssueMessage(parsed.error));
      saveMutation.mutate(() => updatePromoCode(promoCode.id, parsed.data));
    } else {
      const parsed = CreatePromoCodeSchema.safeParse({
        code: code.trim().toUpperCase(),
        discountType,
        value: Number(value),
        maxUsage: maxUsage ? Number(maxUsage) : undefined,
        maxUsagePerUser: maxUsagePerUser ? Number(maxUsagePerUser) : undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        isActive,
      });
      if (!parsed.success) return setFormError(firstIssueMessage(parsed.error));
      saveMutation.mutate(() => createPromoCode(parsed.data));
    }
  }

  return (
    <FormModal
      title={promoCode ? 'Edit promo code' : 'Add promo code'}
      submitLabel={promoCode ? 'Save changes' : 'Add promo code'}
      busy={saveMutation.isPending}
      submitDisabled={code.trim() === '' || value.trim() === ''}
      error={formError}
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="form-grid">
        <Field label="Code" hint={promoCode ? 'A code can’t be changed once created.' : undefined}>
          <Input
            value={code}
            autoFocus={!promoCode}
            disabled={!!promoCode}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="WELCOME10"
            required
          />
        </Field>
        <Field label="Type">
          <Select
            value={discountType}
            options={[
              { value: 'PERCENTAGE', label: 'Percentage (%)' },
              { value: 'FLAT', label: 'Flat amount (EGP)' },
            ]}
            onChange={(next) => setDiscountType(next as DiscountType)}
          />
        </Field>
        <Field label={discountType === 'PERCENTAGE' ? 'Discount %' : 'Amount (EGP)'}>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={value}
            autoFocus={!!promoCode}
            onChange={(event) => setValue(event.target.value)}
            required
          />
        </Field>
        <Field label="Max usage (total)" hint="Leave empty for unlimited.">
          <Input
            type="number"
            min="1"
            value={maxUsage}
            onChange={(event) => setMaxUsage(event.target.value)}
            placeholder="Unlimited"
          />
        </Field>
        <Field label="Max usage per user" hint="Leave empty for unlimited.">
          <Input
            type="number"
            min="1"
            value={maxUsagePerUser}
            onChange={(event) => setMaxUsagePerUser(event.target.value)}
            placeholder="Unlimited"
          />
        </Field>
        <Field label="Expires at" hint="Leave empty for no expiry.">
          <Input
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </Field>
        <Field label="Status" hint="Paused codes cannot be redeemed until activated.">
          <Select
            value={isActive ? 'active' : 'paused'}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'paused', label: 'Paused' },
            ]}
            onChange={(next) => setIsActive(next === 'active')}
          />
        </Field>
      </div>
    </FormModal>
  );
}
