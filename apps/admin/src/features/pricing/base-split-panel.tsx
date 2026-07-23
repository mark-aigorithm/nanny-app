import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';

import { Button, Card, Feedback, Field, Skeleton } from '@admin/components/ui';
import { fetchPlatformConfig, updatePlatformConfig } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { formatAmount } from '@admin/lib/format';

/** A representative booking used only to illustrate the split live. */
const SAMPLE_HOURS = 3;

export function BaseSplitPanel() {
  const queryClient = useQueryClient();
  const { data: config, isLoading, error } = useQuery({
    queryKey: ['platform-config'],
    queryFn: fetchPlatformConfig,
  });

  const [baseRate, setBaseRate] = useState('');
  const [nannyPercent, setNannyPercent] = useState(80);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (config && !ready) {
      setBaseRate(String(config.standardHourlyRate));
      setNannyPercent(config.nannyPercent);
      setReady(true);
    }
  }, [config, ready]);

  const platformPercent = 100 - nannyPercent;
  const sampleTotal = (Number(baseRate) || 0) * SAMPLE_HOURS;
  const sampleNanny = Math.round(sampleTotal * (nannyPercent / 100) * 100) / 100;
  const samplePlatform = Math.round((sampleTotal - sampleNanny) * 100) / 100;

  const saveMutation = useMutation({
    mutationFn: updatePlatformConfig,
    onSuccess: (updated) => {
      queryClient.setQueryData(['platform-config'], updated);
      setFormError(null);
      setSaved(true);
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    const rate = Number(baseRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      setFormError('Base hourly rate must be greater than 0.');
      return;
    }
    saveMutation.mutate({
      standardHourlyRate: rate,
      nannyPercent,
      platformPercent,
    });
  }

  if (isLoading || !ready) {
    return error != null ? (
      <Card>
        <Feedback tone="error">{apiErrorMessage(error)}</Feedback>
      </Card>
    ) : (
      <BaseSplitSkeleton />
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <div className="card-header">
          <h3>Base rate &amp; revenue split</h3>
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>

        {formError && <Feedback tone="error">{formError}</Feedback>}
        {saved && <Feedback tone="success">Pricing saved.</Feedback>}

        <div className="config-split">
          <section className="config-section">
            <h4 className="section-eyebrow">Base hourly rate</h4>
            <p className="config-section-lead">
              The starting price every booking is built from, before skill add-ons and duration
              discounts.
            </p>
            <div className="rate-field">
              <span className="rate-prefix">EGP</span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={baseRate}
                onChange={(e) => {
                  setSaved(false);
                  setBaseRate(e.target.value);
                }}
                aria-label="Base hourly rate"
                required
              />
              <span className="rate-suffix">/ hour</span>
            </div>
          </section>

          <section className="config-section">
            <h4 className="section-eyebrow">Revenue split</h4>
            <p className="config-section-lead">
              How each booking total is divided. The nanny only ever sees her share.
            </p>

            <div className="split-control">
              <Field label={`Nanny keeps — ${nannyPercent}%`}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={nannyPercent}
                  onChange={(e) => {
                    setSaved(false);
                    setNannyPercent(Number(e.target.value));
                  }}
                  className="split-slider"
                  aria-label="Nanny percentage"
                />
              </Field>

              <div
                className="split-bar"
                role="img"
                aria-label={`Nanny ${nannyPercent}%, platform ${platformPercent}%`}
              >
                <div className="split-bar-nanny" style={{ width: `${nannyPercent}%` }}>
                  {nannyPercent >= 12 && <span>{nannyPercent}%</span>}
                </div>
                <div className="split-bar-platform" style={{ width: `${platformPercent}%` }}>
                  {platformPercent >= 12 && <span>{platformPercent}%</span>}
                </div>
              </div>

              <div className="split-legend">
                <span className="split-legend-item">
                  <span className="dot dot--nanny" /> Nanny {nannyPercent}%
                </span>
                <span className="split-legend-item">
                  <span className="dot dot--platform" /> Platform {platformPercent}%
                </span>
              </div>
            </div>
          </section>
        </div>

        <p className="split-example">
          On a {SAMPLE_HOURS}-hour booking of <strong>EGP {formatAmount(sampleTotal)}</strong>, the
          nanny earns <strong className="text-nanny">EGP {formatAmount(sampleNanny)}</strong> and
          the platform keeps{' '}
          <strong className="text-platform">EGP {formatAmount(samplePlatform)}</strong>.
        </p>
      </Card>
    </form>
  );
}

/** Placeholder shaped like the base-rate and revenue-split cards while config loads. */
function BaseSplitSkeleton() {
  return (
    <div className="card" role="status" aria-label="Loading pricing…">
      <div className="card-header">
        <Skeleton width={230} height={19} />
        <Skeleton width={130} height={40} radius="var(--radius-full)" />
      </div>
      <div className="config-split">
        <div className="config-section">
          <Skeleton width={120} height={11} />
          <div className="skeleton-lines">
            <Skeleton width="90%" height={11} />
            <Skeleton width="70%" height={11} />
          </div>
          <Skeleton width={200} height={52} radius="var(--radius-sm)" />
        </div>
        <div className="config-section">
          <Skeleton width={110} height={11} />
          <div className="skeleton-lines">
            <Skeleton width="95%" height={11} />
            <Skeleton width="60%" height={11} />
          </div>
          <Skeleton height={38} radius="999px" />
          <div className="calc-skeleton-row">
            <Skeleton width={120} height={12} />
            <Skeleton width={120} height={12} />
          </div>
        </div>
      </div>
    </div>
  );
}
