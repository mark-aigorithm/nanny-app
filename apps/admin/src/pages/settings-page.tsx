import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';

import { UpdatePlatformConfigSchema } from '@nanny-app/shared';

import {
  Button,
  Card,
  ErrorState,
  Feedback,
  Field,
  LoadingState,
  PageHeader,
  useToast,
} from '@admin/components/ui';
import { fetchPlatformConfig, updatePlatformConfig } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

/** Booking-window limits + matching/SLA settings — pricing lives on Pricing & Fees. */
type SettingsKey =
  | 'maxBookingHours'
  | 'minBookingHours'
  | 'minAdvanceBookingHours'
  | 'cancellationWindowHours'
  | 'broadcastRadiusKm'
  | 'pendingWarningMinutes'
  | 'pendingCriticalMinutes';

type ConfigField = {
  key: SettingsKey;
  label: string;
  hint: string;
  step?: string;
};

const BOOKING_FIELDS: ConfigField[] = [
  {
    key: 'maxBookingHours',
    label: 'Max booking hours',
    hint: 'Maximum hours a mother can reserve in one booking.',
  },
  {
    key: 'minBookingHours',
    label: 'Min booking hours',
    hint: 'Minimum hours a mother can reserve in one booking.',
  },
  {
    key: 'minAdvanceBookingHours',
    label: 'Min advance notice (hours)',
    hint: 'Minimum lead time before a booking can start.',
  },
  {
    key: 'cancellationWindowHours',
    label: 'Cancellation window (hours)',
    hint: 'Hours before start time after which cancellation incurs a fee.',
  },
];

const MATCHING_FIELDS: ConfigField[] = [
  {
    key: 'broadcastRadiusKm',
    label: 'Broadcast radius (km)',
    hint: 'Only nannies within this distance of the family are notified of new requests. 0 notifies everyone.',
    step: '0.5',
  },
  {
    key: 'pendingWarningMinutes',
    label: 'Pending warning threshold (min)',
    hint: 'Pending bookings older than this are highlighted yellow on the Bookings page.',
  },
  {
    key: 'pendingCriticalMinutes',
    label: 'Pending critical threshold (min)',
    hint: 'Pending bookings older than this are highlighted red on the Bookings page.',
  },
];

export function SettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: config, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['platform-config'],
    queryFn: fetchPlatformConfig,
  });

  const [form, setForm] = useState<Record<SettingsKey, string> | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (config && form === null) {
      setForm({
        maxBookingHours: String(config.maxBookingHours),
        minBookingHours: String(config.minBookingHours),
        minAdvanceBookingHours: String(config.minAdvanceBookingHours),
        cancellationWindowHours: String(config.cancellationWindowHours),
        broadcastRadiusKm: String(config.broadcastRadiusKm),
        pendingWarningMinutes: String(config.pendingWarningMinutes),
        pendingCriticalMinutes: String(config.pendingCriticalMinutes),
      });
    }
  }, [config, form]);

  const saveMutation = useMutation({
    mutationFn: updatePlatformConfig,
    onSuccess: (updated) => {
      queryClient.setQueryData(['platform-config'], updated);
      setFormError(null);
      toast.success('Settings saved', 'New values apply to every new booking.');
    },
    onError: (err) => toast.error('Couldn’t save settings', apiErrorMessage(err)),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const parsed = UpdatePlatformConfigSchema.safeParse({
      maxBookingHours: Number(form.maxBookingHours),
      minBookingHours: Number(form.minBookingHours),
      minAdvanceBookingHours: Number(form.minAdvanceBookingHours),
      cancellationWindowHours: Number(form.cancellationWindowHours),
      broadcastRadiusKm: Number(form.broadcastRadiusKm),
      pendingWarningMinutes: Number(form.pendingWarningMinutes),
      pendingCriticalMinutes: Number(form.pendingCriticalMinutes),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFormError(issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid input');
      return;
    }
    if (Number(form.minBookingHours) > Number(form.maxBookingHours)) {
      setFormError('Min booking hours cannot exceed max booking hours');
      return;
    }
    setFormError(null);
    saveMutation.mutate(parsed.data);
  }

  return (
    <section>
      <PageHeader
        title="Configuration"
        subtitle="Booking-window limits, nanny-matching radius, and pending-booking SLA thresholds. Rates and fees live on the Pricing & Fees page."
      />
      {isLoading && (
        <Card>
          <LoadingState label="Loading configuration…" />
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
        <Card>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              {BOOKING_FIELDS.map((field) => (
                <Field key={field.key} label={field.label} hint={field.hint}>
                  <input
                    type="number"
                    min="0"
                    step={field.step ?? '1'}
                    value={form[field.key]}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    required
                  />
                </Field>
              ))}
            </div>
            <h2 className="form-section-title">Matching &amp; SLA</h2>
            <div className="form-grid">
              {MATCHING_FIELDS.map((field) => (
                <Field key={field.key} label={field.label} hint={field.hint}>
                  <input
                    type="number"
                    min="0"
                    step={field.step ?? '1'}
                    value={form[field.key]}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    required
                  />
                </Field>
              ))}
            </div>
            {formError && <Feedback tone="error">{formError}</Feedback>}
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : 'Save settings'}
            </Button>
          </form>
        </Card>
      )}
    </section>
  );
}
