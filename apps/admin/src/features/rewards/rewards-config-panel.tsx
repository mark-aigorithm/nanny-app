import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';

import { UpdateRewardConfigSchema } from '@nanny-app/shared';

import {
  Button,
  Card,
  ErrorState,
  Feedback,
  Field,
  LoadingState,
  useToast,
} from '@admin/components/ui';
import { fetchRewardConfig, updateRewardConfig } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

type NumericKey = 'pointsPerBookedHour' | 'redemptionPointsPerHour' | 'minRedemptionPoints';

type NumericField = { key: NumericKey; label: string; hint: string; min?: string };

const FIELDS: NumericField[] = [
  {
    key: 'pointsPerBookedHour',
    label: 'Points earned per booked hour',
    hint: 'Awarded to the parent when a booking is completed (e.g. 10 → a 3-hour booking earns 30 points).',
  },
  {
    key: 'redemptionPointsPerHour',
    label: 'Points to redeem one free hour',
    hint: 'How many points a parent spends for one free care hour of credit.',
    min: '1',
  },
  {
    key: 'minRedemptionPoints',
    label: 'Minimum points per redemption',
    hint: 'A parent must spend at least this many points in a single redemption.',
  },
];

type FormState = {
  enabled: boolean;
  pointsPerBookedHour: string;
  redemptionPointsPerHour: string;
  minRedemptionPoints: string;
};

export function RewardsConfigPanel() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: config, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['reward-config'],
    queryFn: fetchRewardConfig,
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (config && form === null) {
      setForm({
        enabled: config.enabled,
        pointsPerBookedHour: String(config.pointsPerBookedHour),
        redemptionPointsPerHour: String(config.redemptionPointsPerHour),
        minRedemptionPoints: String(config.minRedemptionPoints),
      });
    }
  }, [config, form]);

  const saveMutation = useMutation({
    mutationFn: updateRewardConfig,
    onSuccess: (updated) => {
      queryClient.setQueryData(['reward-config'], updated);
      setFormError(null);
      toast.success('Care Points saved', 'New rates apply to future bookings and redemptions.');
    },
    onError: (err) => toast.error('Couldn’t save Care Points', apiErrorMessage(err)),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const parsed = UpdateRewardConfigSchema.safeParse({
      enabled: form.enabled,
      pointsPerBookedHour: Number(form.pointsPerBookedHour),
      redemptionPointsPerHour: Number(form.redemptionPointsPerHour),
      minRedemptionPoints: Number(form.minRedemptionPoints),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFormError(issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid input');
      return;
    }
    setFormError(null);
    saveMutation.mutate(parsed.data);
  }

  const earnPreview =
    form && Number(form.pointsPerBookedHour) > 0
      ? `A 3-hour booking earns ${Number(form.pointsPerBookedHour) * 3} Care Points.`
      : 'Earning is effectively off (0 points per hour).';
  const redeemPreview =
    form && Number(form.redemptionPointsPerHour) > 0
      ? `${form.redemptionPointsPerHour} points → 1 free care hour.`
      : null;

  return (
    <>
      {isLoading && (
        <Card>
          <LoadingState label="Loading Care Points settings…" />
        </Card>
      )}
      {error != null && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {form && (
        <Card title="Care Points program">
          <form onSubmit={handleSubmit}>
            <label className="reward-toggle">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              />
              <span>
                <span className="reward-toggle-title">Program enabled</span>
                <span className="reward-toggle-hint">
                  When off, no points are earned and redemptions are blocked.
                </span>
              </span>
            </label>

            <div className="form-grid">
              {FIELDS.map((field) => (
                <Field key={field.key} label={field.label} hint={field.hint}>
                  <input
                    type="number"
                    min={field.min ?? '0'}
                    step="1"
                    value={form[field.key]}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    required
                  />
                </Field>
              ))}
            </div>

            <p className="reward-rate-preview">
              {earnPreview} {redeemPreview}
            </p>

            {formError && <Feedback tone="error">{formError}</Feedback>}
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : 'Save Care Points'}
            </Button>
          </form>
        </Card>
      )}
    </>
  );
}
