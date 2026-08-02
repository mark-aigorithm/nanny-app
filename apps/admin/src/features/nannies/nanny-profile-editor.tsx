import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { AvailabilityType, UpdateAdminNannySchema } from '@nanny-app/shared';
import type {
  AdminNannyDetail,
  AvailabilityType as AvailabilityTypeValue,
  Certification,
  DaySchedule,
  UpdateAdminNanny,
  WeeklySchedule,
} from '@nanny-app/shared';

import {
  Button,
  Feedback,
  Field,
  Select,
  useToast,
  type SelectOption,
} from '@admin/components/ui';
import { updateNanny } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

type NannyProfileEditorProps = {
  nanny: AdminNannyDetail;
  /** Active certification catalog to choose from. */
  certifications: Certification[];
  onDone: () => void;
};

// Registration-time age bands — mirrors AGE_RANGE_OPTIONS in
// RegistrationNannyDetailsScreen (apps/mobile), the only other writer of this
// free-text field, so admin edits stay on the same vocabulary.
const AGE_RANGE_OPTIONS = ['0-1', '1-3', '3-5', '5+'];

const AVAILABILITY_OPTIONS: SelectOption<AvailabilityTypeValue>[] = [
  { value: AvailabilityType.FULL_TIME, label: 'Full-time' },
  { value: AvailabilityType.PART_TIME, label: 'Part-time' },
  { value: AvailabilityType.OCCASIONAL, label: 'Occasional' },
];

// Day-of-week keys are strings ("0" = Sun … "6" = Sat), per WeeklyScheduleSchema.
// Order/labels mirror DAY_ORDER/DAY_NAMES in RegistrationNannyDetailsScreen.
const DAY_ORDER = ['1', '2', '3', '4', '5', '6', '0'];
const DAY_NAMES: Record<string, string> = {
  '1': 'Monday',
  '2': 'Tuesday',
  '3': 'Wednesday',
  '4': 'Thursday',
  '5': 'Friday',
  '6': 'Saturday',
  '0': 'Sunday',
};
const DEFAULT_DAY: DaySchedule = { available: false, startTime: '08:00', endTime: '18:00' };

/** Seeds every day of the week, defaulting missing days to "off". */
function seedSchedule(schedule: WeeklySchedule | null): WeeklySchedule {
  const seeded: WeeklySchedule = {};
  for (const day of DAY_ORDER) {
    seeded[day] = schedule?.[day] ?? { ...DEFAULT_DAY };
  }
  return seeded;
}

function getDay(schedule: WeeklySchedule, day: string): DaySchedule {
  return schedule[day] ?? DEFAULT_DAY;
}

/** A modern on/off pill toggle, styled from theme tokens (mirrors rewards-config-panel's Switch). */
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

export function NannyProfileEditor({ nanny, certifications, onDone }: NannyProfileEditorProps) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [firstName, setFirstName] = useState(nanny.firstName);
  const [lastName, setLastName] = useState(nanny.lastName);
  const [location, setLocation] = useState(nanny.location ?? '');
  const [bio, setBio] = useState(nanny.bio ?? '');
  const [yearsOfExperience, setYearsOfExperience] = useState(
    nanny.yearsOfExperience !== null ? String(nanny.yearsOfExperience) : '',
  );
  const [ageRanges, setAgeRanges] = useState<Set<string>>(() => new Set(nanny.ageRanges));
  const [availabilityType, setAvailabilityType] = useState<AvailabilityTypeValue>(
    nanny.availabilityType,
  );
  const [certificationIds, setCertificationIds] = useState<Set<number>>(
    () => new Set(nanny.certifications.map((c) => c.id)),
  );
  const [schedule, setSchedule] = useState<WeeklySchedule>(() => seedSchedule(nanny.schedule));
  const [formError, setFormError] = useState<string | null>(null);

  function toggleAgeRange(range: string) {
    setAgeRanges((prev) => {
      const next = new Set(prev);
      if (next.has(range)) next.delete(range);
      else next.add(range);
      return next;
    });
  }

  function toggleCertification(id: number) {
    setCertificationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleDayAvailable(day: string) {
    setSchedule((prev) => ({
      ...prev,
      [day]: { ...getDay(prev, day), available: !getDay(prev, day).available },
    }));
  }

  function setDayTime(day: string, field: 'startTime' | 'endTime', value: string) {
    setSchedule((prev) => ({ ...prev, [day]: { ...getDay(prev, day), [field]: value } }));
  }

  function buildPayload(): UpdateAdminNanny {
    const years = yearsOfExperience.trim();
    return {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      location: location.trim(),
      bio: bio.trim(),
      // Optional-not-nullable server-side: an empty field leaves the current value untouched.
      ...(years !== '' ? { yearsOfExperience: Number(years) } : {}),
      ageRanges: [...ageRanges],
      availabilityType,
      schedule,
      certificationIds: [...certificationIds],
    };
  }

  const saveMutation = useMutation({
    mutationFn: () => updateNanny(nanny.id, buildPayload()),
    onSuccess: (updated) => {
      queryClient.setQueryData(['nanny', String(nanny.id)], updated);
      void queryClient.invalidateQueries({ queryKey: ['admin-nannies'] });
      toast.success('Profile updated', `${updated.name}’s profile was saved.`);
      onDone();
    },
    onError: (err) => toast.error('Couldn’t save profile', apiErrorMessage(err)),
  });

  function handleSave() {
    const parsed = UpdateAdminNannySchema.safeParse(buildPayload());
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFormError(issue ? issue.message : 'Invalid input');
      return;
    }
    setFormError(null);
    saveMutation.mutate();
  }

  return (
    <div className="profile-editor">
      <div className="form-section-title">Basic info</div>
      <div className="form-grid">
        <Field label="First name">
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Nour"
            required
            autoFocus
          />
        </Field>
        <Field label="Last name">
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Ibrahim"
            required
          />
        </Field>
        <Field label="Location" hint="Home address shown to parents.">
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Maadi, Cairo"
          />
        </Field>
        <Field label="Years of experience">
          <input
            type="number"
            min="0"
            max="60"
            value={yearsOfExperience}
            onChange={(e) => setYearsOfExperience(e.target.value)}
            placeholder="e.g. 3"
          />
        </Field>
      </div>
      <Field label="Bio">
        <textarea
          className="input"
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="A short introduction shown on her public profile."
        />
      </Field>

      <div className="form-section-title">Age ranges</div>
      <div className="addon-list">
        {AGE_RANGE_OPTIONS.map((range) => (
          <button
            key={range}
            type="button"
            className={ageRanges.has(range) ? 'addon-chip selected' : 'addon-chip'}
            onClick={() => toggleAgeRange(range)}
          >
            <span className="addon-name">{range} yrs</span>
          </button>
        ))}
      </div>

      <div className="form-section-title">Availability</div>
      <Field label="Availability type">
        <Select value={availabilityType} options={AVAILABILITY_OPTIONS} onChange={setAvailabilityType} />
      </Field>

      <div className="form-section-title">Certifications</div>
      {certifications.length === 0 ? (
        <p className="empty-state">
          No active certifications yet — create some on the Certifications page first.
        </p>
      ) : (
        <div className="addon-list">
          {certifications.map((cert) => (
            <button
              key={cert.id}
              type="button"
              className={certificationIds.has(cert.id) ? 'addon-chip selected' : 'addon-chip'}
              onClick={() => toggleCertification(cert.id)}
            >
              <span className="addon-name">{cert.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="form-section-title">Working hours</div>
      <div className="schedule-list">
        {DAY_ORDER.map((day) => {
          const slot = getDay(schedule, day);
          return (
            <div className="schedule-row" key={day}>
              <span className="schedule-day">{DAY_NAMES[day] ?? day}</span>
              {slot.available ? (
                <div className="schedule-times">
                  <input
                    className="input schedule-time-input"
                    type="time"
                    value={slot.startTime}
                    onChange={(e) => setDayTime(day, 'startTime', e.target.value)}
                  />
                  <span>–</span>
                  <input
                    className="input schedule-time-input"
                    type="time"
                    value={slot.endTime}
                    onChange={(e) => setDayTime(day, 'endTime', e.target.value)}
                  />
                </div>
              ) : (
                <span className="schedule-off">Day off</span>
              )}
              <Switch
                checked={slot.available}
                onChange={() => toggleDayAvailable(day)}
                label={slot.available ? 'Available' : 'Off'}
              />
            </div>
          );
        })}
      </div>

      {formError && <Feedback tone="error">{formError}</Feedback>}
      {saveMutation.error != null && (
        <Feedback tone="error">{apiErrorMessage(saveMutation.error)}</Feedback>
      )}

      <div className="row-actions">
        <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Saving…' : 'Save profile'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={saveMutation.isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
