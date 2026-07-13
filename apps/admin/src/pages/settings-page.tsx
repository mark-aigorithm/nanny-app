import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';

import { PlatformConfigSchema, type PlatformConfig } from '@nanny-app/shared';

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

type ConfigField = {
  key: keyof PlatformConfig;
  label: string;
  hint: string;
  step?: string;
};

const FIELDS: ConfigField[] = [
  {
    key: 'serviceFeePercent',
    label: 'Service fee (%)',
    hint: 'Platform fee taken on each booking.',
    step: '0.1',
  },
  {
    key: 'standardHourlyRate',
    label: 'Standard hourly rate (EGP)',
    hint: 'Fixed hourly rate charged for every booking (parents no longer pick a nanny).',
    step: '0.5',
  },
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

export function SettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: config, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['platform-config'],
    queryFn: fetchPlatformConfig,
  });

  const [form, setForm] = useState<Record<keyof PlatformConfig, string> | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (config && form === null) {
      setForm({
        serviceFeePercent: String(config.serviceFeePercent),
        standardHourlyRate: String(config.standardHourlyRate),
        maxBookingHours: String(config.maxBookingHours),
        minBookingHours: String(config.minBookingHours),
        minAdvanceBookingHours: String(config.minAdvanceBookingHours),
        cancellationWindowHours: String(config.cancellationWindowHours),
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
    const parsed = PlatformConfigSchema.safeParse({
      serviceFeePercent: Number(form.serviceFeePercent),
      standardHourlyRate: Number(form.standardHourlyRate),
      maxBookingHours: Number(form.maxBookingHours),
      minBookingHours: Number(form.minBookingHours),
      minAdvanceBookingHours: Number(form.minAdvanceBookingHours),
      cancellationWindowHours: Number(form.cancellationWindowHours),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFormError(issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid input');
      return;
    }
    if (parsed.data.minBookingHours > parsed.data.maxBookingHours) {
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
        subtitle="Platform-wide settings applied to every new booking."
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
              {FIELDS.map((field) => (
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
