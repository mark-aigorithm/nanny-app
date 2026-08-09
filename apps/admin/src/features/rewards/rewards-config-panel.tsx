import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';

import { UpdateRewardConfigSchema } from '@nanny-app/shared';

import {
  Button,
  Card,
  Coins,
  ErrorState,
  Feedback,
  Field,
  Gift,
  ICON_SIZE,
  LoadingState,
  Sparkles,
  StaleRefreshBanner,
  useToast,
} from '@admin/components/ui';
import { fetchRewardConfig, updateRewardConfig } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

type NumericKey =
  | 'pointsPerBookedHour'
  | 'redemptionPointsPerHour'
  | 'minRedemptionPoints'
  | 'referrerPoints'
  | 'refereePoints';

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

/** Referral payouts, shown in their own section below the earn/redeem rates. */
const REFERRAL_FIELDS: NumericField[] = [
  {
    key: 'referrerPoints',
    label: 'Points for the referrer',
    hint: 'Paid to the inviting parent once their invitee’s first booking is completed.',
  },
  {
    key: 'refereePoints',
    label: 'Welcome points for the invitee',
    hint: 'Credited immediately when a new parent signs up with a referral code.',
  },
];

/** A modern on/off pill toggle, styled from theme tokens. */
function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track">
        <span className="switch-thumb" />
      </span>
      <span className="switch-label">{label}</span>
    </label>
  );
}

type FormState = {
  enabled: boolean;
  pointsPerBookedHour: string;
  redemptionPointsPerHour: string;
  minRedemptionPoints: string;
  referralEnabled: boolean;
  referrerPoints: string;
  refereePoints: string;
};

export function RewardsConfigPanel() {
  const canManage = useCanManage('rewards');
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
        referralEnabled: config.referralEnabled,
        referrerPoints: String(config.referrerPoints),
        refereePoints: String(config.refereePoints),
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
      referralEnabled: form.referralEnabled,
      referrerPoints: Number(form.referrerPoints),
      refereePoints: Number(form.refereePoints),
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

  // Restate the payout as free care hours, so the per-referral cost to the
  // platform is obvious while setting the numbers.
  const perHour = form ? Number(form.redemptionPointsPerHour) : 0;
  const totalPayout = form ? Number(form.referrerPoints) + Number(form.refereePoints) : 0;
  const referralPreview = !form
    ? null
    : !form.referralEnabled
      ? 'Referrals are off — codes will not resolve and pending referrals will not pay out.'
      : perHour > 0
        ? `Each successful referral costs ${totalPayout} points — about ${
            Math.round((totalPayout / perHour) * 10) / 10
          } free care hours, split between both parents.`
        : `Each successful referral costs ${totalPayout} points.`;

  return (
    <>
      {isLoading && (
        <Card>
          <LoadingState label="Loading Care Points settings…" />
        </Card>
      )}
      {error != null && !form && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {form && (
        <form onSubmit={handleSubmit} className="reward-config">
          {error != null && (
            <StaleRefreshBanner
              message={apiErrorMessage(error)}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}

          {/* ── Earning & redemption ─────────────────────────── */}
          <section className={`card reward-section${form.enabled ? '' : ' reward-section--off'}`}>
            <header className="reward-section-head">
              <span className="reward-section-icon">
                <Coins size={ICON_SIZE.stat} />
              </span>
              <div className="reward-section-heading">
                <h3>Earning &amp; redemption</h3>
                <p>How parents earn Care Points and cash them in for free care hours.</p>
              </div>
              <Switch
                checked={form.enabled}
                onChange={(v) => setForm({ ...form, enabled: v })}
                label={form.enabled ? 'Enabled' : 'Off'}
              />
            </header>

            <div className="form-grid">
              {FIELDS.map((field) => (
                <Field key={field.key} label={field.label} hint={field.hint}>
                  <div className="input-suffix">
                    <input
                      type="number"
                      min={field.min ?? '0'}
                      step="1"
                      value={form[field.key]}
                      onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                      required
                    />
                    <span>pts</span>
                  </div>
                </Field>
              ))}
            </div>

            <p className="reward-callout">
              <Sparkles size={ICON_SIZE.inline} />
              <span>
                {earnPreview} {redeemPreview}
              </span>
            </p>
          </section>

          {/* ── Referrals ────────────────────────────────────── */}
          <section
            className={`card reward-section${form.referralEnabled ? '' : ' reward-section--off'}`}
          >
            <header className="reward-section-head">
              <span className="reward-section-icon reward-section-icon--referral">
                <Gift size={ICON_SIZE.stat} />
              </span>
              <div className="reward-section-heading">
                <h3>Referral program</h3>
                <p>Reward both parents when an invited parent joins and completes their first booking.</p>
              </div>
              <Switch
                checked={form.referralEnabled}
                onChange={(v) => setForm({ ...form, referralEnabled: v })}
                label={form.referralEnabled ? 'Enabled' : 'Off'}
              />
            </header>

            <div className="form-grid">
              {REFERRAL_FIELDS.map((field) => (
                <Field key={field.key} label={field.label} hint={field.hint}>
                  <div className="input-suffix">
                    <input
                      type="number"
                      min={field.min ?? '0'}
                      step="1"
                      value={form[field.key]}
                      onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                      required
                    />
                    <span>pts</span>
                  </div>
                </Field>
              ))}
            </div>

            <p className={`reward-callout${form.referralEnabled ? '' : ' reward-callout--warn'}`}>
              <Sparkles size={ICON_SIZE.inline} />
              <span>{referralPreview}</span>
            </p>
          </section>

          <footer className="reward-save-bar">
            {formError && <Feedback tone="error">{formError}</Feedback>}
            <div className="reward-save-bar-actions">
              <span className="reward-save-hint">
                Changes apply to future bookings and redemptions.
              </span>
              {canManage && (
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving…' : 'Save Care Points'}
                </Button>
              )}
            </div>
          </footer>
        </form>
      )}
    </>
  );
}
