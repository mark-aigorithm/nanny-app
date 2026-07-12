import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';

import { Button, Card, Feedback, Field } from '@admin/components/ui';
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
    return (
      <Card>
        {error != null ? (
          <Feedback tone="error">{apiErrorMessage(error)}</Feedback>
        ) : (
          <p>Loading pricing…</p>
        )}
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card title="Base hourly rate">
        <p className="panel-lead">
          The starting price every booking is built from, before skill add-ons and
          duration discounts. Charged per hour, in EGP.
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
      </Card>

      <Card title="Revenue split">
        <p className="panel-lead">
          How each booking total is divided between the nanny and the platform.
          The nanny only ever sees her share.
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

          <div className="split-bar" role="img" aria-label={`Nanny ${nannyPercent}%, platform ${platformPercent}%`}>
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

          <p className="split-example">
            On a {SAMPLE_HOURS}-hour booking of{' '}
            <strong>EGP {formatAmount(sampleTotal)}</strong>, the nanny earns{' '}
            <strong className="text-nanny">EGP {formatAmount(sampleNanny)}</strong> and the
            platform keeps{' '}
            <strong className="text-platform">EGP {formatAmount(samplePlatform)}</strong>.
          </p>
        </div>
      </Card>

      {formError && <Feedback tone="error">{formError}</Feedback>}
      {saved && <Feedback tone="success">Pricing saved.</Feedback>}
      <Button type="submit" disabled={saveMutation.isPending}>
        {saveMutation.isPending ? 'Saving…' : 'Save base & split'}
      </Button>
    </form>
  );
}
