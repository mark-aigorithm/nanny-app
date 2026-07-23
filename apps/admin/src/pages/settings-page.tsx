import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';

import {
  bookingWindowLengthHours,
  UpdatePlatformConfigSchema,
  UpdateSupportContactSchema,
} from '@nanny-app/shared';

import {
  BellRing,
  Button,
  CalendarClock,
  CalendarX2,
  Card,
  Clock,
  ErrorState,
  Feedback,
  Field,
  Hourglass,
  ICON_SIZE,
  MapPin,
  PageHeader,
  Phone,
  Skeleton,
  TriangleAlert,
  useToast,
  type LucideIcon,
} from '@admin/components/ui';
import {
  fetchPlatformConfig,
  fetchSupportContact,
  updatePlatformConfig,
  updateSupportContact,
} from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

/**
 * Booking-window limits + matching/SLA settings — pricing lives on Pricing & Fees.
 * One list drives the form state, the dirty check and the save payload so the
 * three can't drift apart.
 */
const SETTINGS_KEYS = [
  'bookingWindowStartHour',
  'bookingWindowEndHour',
  'minBookingHours',
  'maxBookingHours',
  'minAdvanceBookingHours',
  'cancellationWindowHours',
  'broadcastRadiusKm',
  'pendingWarningMinutes',
  'pendingCriticalMinutes',
  'revealPhoneMinutes',
] as const;

type SettingsKey = (typeof SETTINGS_KEYS)[number];
type SettingsForm = Record<SettingsKey, string>;
type SettingsValues = Record<SettingsKey, number>;

type ConfigField = {
  key: SettingsKey;
  label: string;
  /** Unit rendered inside the input's box, so labels stay free of parentheses. */
  unit: string;
  hint?: string;
  min?: string;
  max?: string;
  step?: string;
};

/** A set of related settings introduced by one shared explanation. */
type ConfigGroup = {
  eyebrow: string;
  lead: string;
  fields: ConfigField[];
};

const BOOKING_GROUPS: ConfigGroup[] = [
  {
    eyebrow: 'Daily booking window',
    lead:
      'The hours care may run each day. Set the end at or before the start to run past midnight — ' +
      '8 and 2 together mean 8am to 2am the next day.',
    fields: [
      { key: 'bookingWindowStartHour', label: 'Starts from', unit: ':00', max: '23' },
      { key: 'bookingWindowEndHour', label: 'Ends by', unit: ':00', max: '23' },
    ],
  },
  {
    eyebrow: 'Booking length',
    lead:
      'How long a single booking may run. The minimum can never be longer than the window itself.',
    fields: [
      { key: 'minBookingHours', label: 'Minimum', unit: 'hours', min: '1', max: '24' },
      { key: 'maxBookingHours', label: 'Maximum', unit: 'hours', min: '1', max: '24' },
    ],
  },
  {
    eyebrow: 'Notice & cancellation',
    lead: 'How far ahead a parent must reserve, and when calling a booking off starts costing them.',
    fields: [
      {
        key: 'minAdvanceBookingHours',
        label: 'Min advance notice',
        unit: 'hours',
        hint: '0 allows booking right up to the start.',
        max: '168',
      },
      {
        key: 'cancellationWindowHours',
        label: 'Cancellation window',
        unit: 'hours',
        hint: 'Cancelling inside it incurs a fee.',
        max: '168',
      },
    ],
  },
];

const MATCHING_GROUPS: ConfigGroup[] = [
  {
    eyebrow: 'Nanny matching',
    lead:
      'Only nannies within this distance of the family are notified of a new request and see it ' +
      'in their requests pool.',
    fields: [
      {
        key: 'broadcastRadiusKm',
        label: 'Broadcast radius',
        unit: 'km',
        hint: '0 notifies every eligible nanny.',
        step: '0.5',
        max: '500',
      },
    ],
  },
  {
    eyebrow: 'Pending-booking SLA',
    lead:
      'How long a booking may sit unaccepted before the Bookings page highlights it for follow-up.',
    fields: [
      {
        key: 'pendingWarningMinutes',
        label: 'Warning (yellow)',
        unit: 'min',
        min: '1',
        max: '10080',
      },
      {
        key: 'pendingCriticalMinutes',
        label: 'Critical (red)',
        unit: 'min',
        min: '1',
        max: '10080',
      },
    ],
  },
  {
    eyebrow: 'Parent privacy',
    lead:
      'On a confirmed booking the parent sees the nanny’s phone number this long before the start ' +
      'time, and until the shift ends. Before that it stays hidden.',
    fields: [
      { key: 'revealPhoneMinutes', label: 'Reveal phone before start', unit: 'min', max: '1440' },
    ],
  },
];

type SupportKey = 'whatsappNumber' | 'phoneNumber' | 'email';

type SupportField = {
  key: SupportKey;
  label: string;
  hint: string;
  type: 'tel' | 'email';
  placeholder: string;
};

const SUPPORT_FIELDS: SupportField[] = [
  {
    key: 'whatsappNumber',
    label: 'WhatsApp number',
    hint: 'Opens a WhatsApp chat. Include the country code.',
    type: 'tel',
    placeholder: '+20 100 123 4567',
  },
  {
    key: 'phoneNumber',
    label: 'Phone number',
    hint: 'Dialled when a parent taps “Call support”.',
    type: 'tel',
    placeholder: '+20 100 123 4567',
  },
  {
    key: 'email',
    label: 'Email address',
    hint: 'Opens a pre-addressed email from the help screen.',
    type: 'email',
    placeholder: 'support@nannynow.com',
  },
];

/** Hour of the day as a 24h clock reading. */
function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function formatHours(hours: number): string {
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const wholeHours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${wholeHours} h` : `${wholeHours} h ${rest} min`;
}

type SummaryLine = { icon: LucideIcon; title: string; detail?: string };

/** Restates the current form values as the rules a parent would actually meet. */
function buildSummary(v: SettingsValues): SummaryLine[] {
  const windowLength = bookingWindowLengthHours(v.bookingWindowStartHour, v.bookingWindowEndHour);
  const crossesMidnight = v.bookingWindowEndHour <= v.bookingWindowStartHour;
  return [
    {
      icon: Clock,
      title: `Care runs ${formatHour(v.bookingWindowStartHour)} → ${formatHour(v.bookingWindowEndHour)}`,
      detail: `A ${windowLength}-hour window${crossesMidnight ? ', crossing midnight' : ' each day'}.`,
    },
    {
      icon: Hourglass,
      title:
        v.minBookingHours === v.maxBookingHours
          ? `Bookings are exactly ${formatHours(v.maxBookingHours)}`
          : `Bookings run ${v.minBookingHours}–${v.maxBookingHours} hours`,
    },
    {
      icon: CalendarClock,
      title:
        v.minAdvanceBookingHours === 0
          ? 'Bookable right up to the start time'
          : `Booked at least ${formatHours(v.minAdvanceBookingHours)} ahead`,
    },
    {
      icon: CalendarX2,
      title:
        v.cancellationWindowHours === 0
          ? 'Cancelling is always free'
          : `Cancelling within ${formatHours(v.cancellationWindowHours)} of the start incurs a fee`,
    },
    {
      icon: MapPin,
      title:
        v.broadcastRadiusKm === 0
          ? 'Requests go to every eligible nanny'
          : `Requests go to nannies within ${v.broadcastRadiusKm} km`,
    },
    {
      icon: BellRing,
      title: `Pending bookings flag at ${formatMinutes(v.pendingWarningMinutes)}`,
      detail: `Critical at ${formatMinutes(v.pendingCriticalMinutes)}.`,
    },
    {
      icon: Phone,
      title:
        v.revealPhoneMinutes === 0
          ? 'The nanny’s number appears at the start time'
          : `The nanny’s number appears ${formatMinutes(v.revealPhoneMinutes)} before the start`,
    },
  ];
}

/**
 * Combinations that would leave nothing bookable. The server enforces these too
 * — it's the one that can see un-sent fields — but flagging them live means the
 * admin never submits a form that can't succeed.
 */
function findIssues(v: SettingsValues): string[] {
  const issues: string[] = [];
  if (v.minBookingHours > v.maxBookingHours) {
    issues.push('The minimum booking length is longer than the maximum.');
  }
  const windowLength = bookingWindowLengthHours(v.bookingWindowStartHour, v.bookingWindowEndHour);
  if (v.minBookingHours > windowLength) {
    issues.push(
      `The booking window is only ${windowLength} hours long — shorter than the ${v.minBookingHours}-hour minimum booking.`,
    );
  }
  if (v.pendingWarningMinutes >= v.pendingCriticalMinutes) {
    issues.push('The pending warning threshold must be below the critical threshold.');
  }
  return issues;
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: config, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['platform-config'],
    queryFn: fetchPlatformConfig,
  });

  const [form, setForm] = useState<SettingsForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (config && form === null) setForm(toForm(config));
  }, [config, form]);

  const saveMutation = useMutation({
    mutationFn: updatePlatformConfig,
    onSuccess: (updated) => {
      queryClient.setQueryData(['platform-config'], updated);
      setForm(toForm(updated));
      setFormError(null);
      toast.success('Settings saved', 'New values apply to every new booking.');
    },
    onError: (err) => toast.error('Couldn’t save settings', apiErrorMessage(err)),
  });

  const {
    data: support,
    isLoading: supportLoading,
    error: supportError,
    refetch: refetchSupport,
    isFetching: supportFetching,
  } = useQuery({
    queryKey: ['support-contact'],
    queryFn: fetchSupportContact,
  });

  const [supportForm, setSupportForm] = useState<Record<SupportKey, string> | null>(null);
  const [supportFormError, setSupportFormError] = useState<string | null>(null);

  useEffect(() => {
    if (support && supportForm === null) {
      setSupportForm({
        whatsappNumber: support.whatsappNumber,
        phoneNumber: support.phoneNumber,
        email: support.email,
      });
    }
  }, [support, supportForm]);

  const saveSupportMutation = useMutation({
    mutationFn: updateSupportContact,
    onSuccess: (updated) => {
      queryClient.setQueryData(['support-contact'], updated);
      setSupportForm({
        whatsappNumber: updated.whatsappNumber,
        phoneNumber: updated.phoneNumber,
        email: updated.email,
      });
      setSupportFormError(null);
      toast.success('Support contact saved', 'Parents see the change the next time they open help.');
    },
    onError: (err) => toast.error('Couldn’t save support contact', apiErrorMessage(err)),
  });

  function handleSupportSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supportForm) return;
    const parsed = UpdateSupportContactSchema.safeParse(supportForm);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setSupportFormError(issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid input');
      return;
    }
    setSupportFormError(null);
    saveSupportMutation.mutate(parsed.data);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const parsed = UpdatePlatformConfigSchema.safeParse(toValues(form));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFormError(issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid input');
      return;
    }
    setFormError(null);
    saveMutation.mutate(parsed.data);
  }

  const values = form ? toValues(form) : null;
  const issues = values ? findIssues(values) : [];
  const dirty = form != null && config != null && SETTINGS_KEYS.some((k) => form[k] !== String(config[k]));

  function renderGroup(group: ConfigGroup) {
    if (!form) return null;
    return (
      <div className="config-group" key={group.eyebrow}>
        <div className="config-group-head">
          <h4 className="section-eyebrow">{group.eyebrow}</h4>
          <p>{group.lead}</p>
        </div>
        <div className="config-group-fields">
          {group.fields.map((field) => (
            <Field key={field.key} label={field.label} hint={field.hint}>
              <span className="unit-input">
                <input
                  type="number"
                  min={field.min ?? '0'}
                  {...(field.max ? { max: field.max } : {})}
                  step={field.step ?? '1'}
                  value={form[field.key]}
                  onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                  required
                />
                <span className="unit-input-suffix">{field.unit}</span>
              </span>
            </Field>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section>
      <PageHeader
        title="Booking options"
        subtitle="When care can be booked and for how long, how far a request travels, and the pending-booking thresholds. Hours are local time — rates and fees live on the Pricing & Fees page."
      />

      <div className="settings-layout">
        <div className="settings-main">
          {error != null ? (
            <ErrorState
              message={apiErrorMessage(error)}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          ) : isLoading || !form ? (
            <ConfigSkeleton />
          ) : (
            <form id="platform-config-form" onSubmit={handleSubmit}>
              <Card>
                <div className="card-header">
                  <h3>Booking rules</h3>
                </div>
                {BOOKING_GROUPS.map(renderGroup)}
              </Card>
              <Card>
                <div className="card-header">
                  <h3>Matching, SLA &amp; privacy</h3>
                </div>
                {MATCHING_GROUPS.map(renderGroup)}
              </Card>
            </form>
          )}

          {supportError != null ? (
            <ErrorState
              message={apiErrorMessage(supportError)}
              onRetry={() => void refetchSupport()}
              retrying={supportFetching}
            />
          ) : supportLoading || !supportForm ? (
            <SupportSkeleton />
          ) : (
            <form onSubmit={handleSupportSubmit}>
              <Card>
                <div className="card-header">
                  <h3>Support contact</h3>
                  <Button type="submit" disabled={saveSupportMutation.isPending}>
                    {saveSupportMutation.isPending ? 'Saving…' : 'Save contact'}
                  </Button>
                </div>
                <p className="panel-lead">
                  How parents reach you from the app’s help screen. Leave a field blank to hide that
                  option.
                </p>
                <div className="form-grid">
                  {SUPPORT_FIELDS.map((field) => (
                    <Field key={field.key} label={field.label} hint={field.hint}>
                      <input
                        type={field.type}
                        placeholder={field.placeholder}
                        value={supportForm[field.key]}
                        onChange={(e) =>
                          setSupportForm({ ...supportForm, [field.key]: e.target.value })
                        }
                      />
                    </Field>
                  ))}
                </div>
                {supportFormError && <Feedback tone="error">{supportFormError}</Feedback>}
              </Card>
            </form>
          )}
        </div>

        <aside className="settings-rail">
          {values ? (
            <div className="card summary-card">
              <div>
                <h4 className="section-eyebrow">Live preview</h4>
                <p className="summary-title">How these rules read right now</p>
              </div>

              <ul className="summary-list">
                {buildSummary(values).map((line) => (
                  <li key={line.title}>
                    <line.icon size={ICON_SIZE.inline} aria-hidden />
                    <span className="summary-line">
                      <strong>{line.title}</strong>
                      {line.detail && <span>{line.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>

              {issues.length > 0 && (
                <ul className="summary-issues">
                  {issues.map((issue) => (
                    <li key={issue}>
                      <TriangleAlert size={14} aria-hidden />
                      {issue}
                    </li>
                  ))}
                </ul>
              )}

              {formError && <Feedback tone="error">{formError}</Feedback>}

              <div className="rail-actions">
                <Button
                  type="submit"
                  form="platform-config-form"
                  disabled={!dirty || issues.length > 0 || saveMutation.isPending}
                >
                  {saveMutation.isPending ? 'Saving…' : 'Save changes'}
                </Button>
                {dirty && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (config) setForm(toForm(config));
                      setFormError(null);
                    }}
                  >
                    Discard
                  </Button>
                )}
              </div>
              <p className={dirty ? 'rail-note rail-note--dirty' : 'rail-note'}>
                {dirty ? 'Unsaved changes to the settings above.' : 'Everything above is saved.'}
              </p>
            </div>
          ) : (
            <RailSkeleton />
          )}
        </aside>
      </div>
    </section>
  );
}

function toForm(config: Record<SettingsKey, number>): SettingsForm {
  return Object.fromEntries(SETTINGS_KEYS.map((k) => [k, String(config[k])])) as SettingsForm;
}

/** Empty and half-typed inputs read as 0 so the preview never shows NaN. */
function toValues(form: SettingsForm): SettingsValues {
  return Object.fromEntries(
    SETTINGS_KEYS.map((k) => [k, Number(form[k]) || 0]),
  ) as SettingsValues;
}

/** Placeholder shaped like a settings card while the config loads. */
function ConfigSkeleton() {
  return (
    <div className="card" role="status" aria-label="Loading booking options…">
      <div className="card-header">
        <Skeleton width={150} height={19} />
      </div>
      {[0, 1, 2].map((row) => (
        <div className="config-group" key={row}>
          <div className="config-group-head">
            <Skeleton width={150} height={11} />
            <Skeleton width="90%" height={11} />
            <Skeleton width="65%" height={11} />
          </div>
          <div className="config-group-fields">
            {[0, 1].map((i) => (
              <div className="field" key={i}>
                <Skeleton width={80} height={11} />
                <Skeleton height={40} radius="var(--radius-sm)" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SupportSkeleton() {
  return (
    <div className="card" role="status" aria-label="Loading support contact…">
      <div className="card-header">
        <Skeleton width={140} height={19} />
        <Skeleton width={120} height={40} radius="var(--radius-full)" />
      </div>
      <div className="form-grid">
        {[0, 1, 2].map((i) => (
          <div className="field" key={i}>
            <Skeleton width={90} height={11} />
            <Skeleton height={40} radius="var(--radius-sm)" />
          </div>
        ))}
      </div>
    </div>
  );
}

function RailSkeleton() {
  return (
    <div className="card summary-card" role="status" aria-label="Loading preview…">
      <Skeleton width={100} height={11} />
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} width={i % 2 === 0 ? '95%' : '75%'} height={12} />
      ))}
      <Skeleton height={40} radius="var(--radius-full)" />
    </div>
  );
}
