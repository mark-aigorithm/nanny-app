import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { CreatePromoCodeSchema, type DiscountType } from '@nanny-app/shared';

import { Button, Card, Feedback, Field } from '@admin/components/ui';
import { createPromoCode } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

export function PromoCodeForm() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<DiscountType>('PERCENTAGE');
  const [value, setValue] = useState('');
  const [maxUsage, setMaxUsage] = useState('');
  const [maxUsagePerUser, setMaxUsagePerUser] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createPromoCode,
    onSuccess: () => {
      setCode('');
      setValue('');
      setMaxUsage('');
      setMaxUsagePerUser('');
      setExpiresAt('');
      setIsActive(true);
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ['promo-codes'] });
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = CreatePromoCodeSchema.safeParse({
      code: code.trim().toUpperCase(),
      discountType,
      value: Number(value),
      maxUsage: maxUsage ? Number(maxUsage) : undefined,
      maxUsagePerUser: maxUsagePerUser ? Number(maxUsagePerUser) : undefined,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      isActive,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFormError(issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid input');
      return;
    }
    createMutation.mutate(parsed.data);
  }

  return (
    <Card title="Create promo code">
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <Field label="Code">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="WELCOME10"
              required
            />
          </Field>
          <Field label="Type">
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as DiscountType)}
            >
              <option value="PERCENTAGE">Percentage (%)</option>
              <option value="FLAT">Flat amount (EGP)</option>
            </select>
          </Field>
          <Field label={discountType === 'PERCENTAGE' ? 'Discount %' : 'Amount (EGP)'}>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </Field>
          <Field label="Max usage (total)" hint="Leave empty for unlimited.">
            <input
              type="number"
              min="1"
              value={maxUsage}
              onChange={(e) => setMaxUsage(e.target.value)}
              placeholder="Unlimited"
            />
          </Field>
          <Field label="Max usage per user" hint="Leave empty for unlimited.">
            <input
              type="number"
              min="1"
              value={maxUsagePerUser}
              onChange={(e) => setMaxUsagePerUser(e.target.value)}
              placeholder="Unlimited"
            />
          </Field>
          <Field label="Expires at" hint="Leave empty for no expiry.">
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </Field>
          <Field label="Status" hint="Paused codes cannot be redeemed until activated.">
            <select
              value={isActive ? 'active' : 'paused'}
              onChange={(e) => setIsActive(e.target.value === 'active')}
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </select>
          </Field>
        </div>
        {formError && <Feedback tone="error">{formError}</Feedback>}
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? 'Creating…' : 'Create promo code'}
        </Button>
      </form>
    </Card>
  );
}
