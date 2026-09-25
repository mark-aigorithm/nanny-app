import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { AGE_RANGES, AvailabilityType } from '@nanny-app/shared';
import type { AgeRange, AvailabilityType as AvailabilityTypeValue, WeeklySchedule } from '@nanny-app/shared';
import { colors } from '@mobile/theme';
import Button from '@mobile/components/ui/button';
import RegistrationHeader from '@mobile/components/RegistrationHeader';
import TimeSelectSheet, { formatTimeDisplay } from '@mobile/components/TimeSelectSheet';
import { useCertificationCatalog, useSkillCatalog } from '@mobile/hooks/useNannies';
import { nextStep, stepInfo } from '@mobile/lib/registrationSteps';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { styles } from './styles/registration-nanny-details-screen.styles';

// Nanny-only step: collects the professional-profile fields that become part
// of the (read-only, admin-editable) public profile once approved. Comes after
// her home location and before her ID. Mirrors the field set + working-hours
// pattern in NannyProfileEditScreen (which edits the same data
// post-approval), but binds straight to the in-memory registration draft
// instead of the live-profile mutation.

// ─── Working hours types & helpers (mirrors NannyProfileEditScreen) ─────────

type DaySchedule = { available: boolean; startTime: string; endTime: string };
type PickerTarget = { day: number; field: 'start' | 'end' };

const DAY_NAMES: Record<number, string> = {
  1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun',
};
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const DEFAULT_SCHEDULE: Record<number, DaySchedule> = {
  1: { available: true, startTime: '08:00', endTime: '18:00' },
  2: { available: true, startTime: '08:00', endTime: '18:00' },
  3: { available: true, startTime: '08:00', endTime: '18:00' },
  4: { available: true, startTime: '08:00', endTime: '18:00' },
  5: { available: true, startTime: '08:00', endTime: '18:00' },
  6: { available: false, startTime: '08:00', endTime: '18:00' },
  0: { available: false, startTime: '08:00', endTime: '18:00' },
};

function apiScheduleToUi(schedule: WeeklySchedule | null | undefined): Record<number, DaySchedule> {
  if (!schedule) return structuredClone(DEFAULT_SCHEDULE);
  const result = structuredClone(DEFAULT_SCHEDULE);
  for (const [key, value] of Object.entries(schedule)) {
    const day = parseInt(key, 10);
    if (!isNaN(day) && day >= 0 && day <= 6) {
      result[day] = value;
    }
  }
  return result;
}

/** "HH:mm" compares correctly as a string. */
function endsAfterStart(slot: DaySchedule): boolean {
  return slot.endTime > slot.startTime;
}

function uiScheduleToApi(schedule: Record<number, DaySchedule>): WeeklySchedule {
  const result: WeeklySchedule = {};
  for (const [day, slot] of Object.entries(schedule)) {
    result[day] = slot;
  }
  return result;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const AVAILABILITY_OPTIONS: { label: string; value: AvailabilityTypeValue }[] = [
  { label: 'Full-time', value: AvailabilityType.FULL_TIME },
  { label: 'Part-time', value: AvailabilityType.PART_TIME },
  { label: 'Occasional', value: AvailabilityType.OCCASIONAL },
];

export default function RegistrationNannyDetailsScreen() {
  const router = useRouter();

  const draft = useRegistrationDraftStore();
  const patch = useRegistrationDraftStore((s) => s.patch);
  const step = stepInfo('details', draft);

  const { data: certCatalog } = useCertificationCatalog();
  const { data: skillCatalog } = useSkillCatalog();

  const [formError, setFormError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<Record<number, DaySchedule>>(() =>
    apiScheduleToUi(draft.schedule),
  );
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);

  // Keep the draft's schedule in sync so it's always ready to send. It is
  // seeded from DEFAULT_SCHEDULE (Mon–Fri available), so the draft carries at
  // least one working day unless she switches them all off — and then the
  // Continue check refuses.
  useEffect(() => {
    patch({ schedule: uiScheduleToApi(schedule) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule]);

  function toggleAgeRange(range: AgeRange) {
    const next = draft.ageRanges.includes(range)
      ? draft.ageRanges.filter((r) => r !== range)
      : [...draft.ageRanges, range];
    patch({ ageRanges: next });
  }

  function toggleCertification(id: number) {
    const next = draft.certificationIds.includes(id)
      ? draft.certificationIds.filter((c) => c !== id)
      : [...draft.certificationIds, id];
    patch({ certificationIds: next });
  }

  function toggleSkill(id: number) {
    const next = draft.skillIds.includes(id)
      ? draft.skillIds.filter((s) => s !== id)
      : [...draft.skillIds, id];
    patch({ skillIds: next });
  }

  // ── Working hours handlers ─────────────────────────────────────────────────

  function toggleDay(day: number) {
    setSchedule((prev) => ({
      ...prev,
      [day]: { ...prev[day]!, available: !prev[day]!.available },
    }));
  }

  function openPicker(day: number, field: 'start' | 'end') {
    setPickerTarget({ day, field });
  }

  function handleTimeSelect(time: string) {
    if (!pickerTarget) return;
    setSchedule((prev) => ({
      ...prev,
      [pickerTarget.day]: {
        ...prev[pickerTarget.day]!,
        ...(pickerTarget.field === 'start' ? { startTime: time } : { endTime: time }),
      },
    }));
    setPickerTarget(null);
  }

  function copyToAllActiveDays() {
    const firstActive = DAY_ORDER.find((d) => schedule[d]?.available);
    if (!firstActive) return;
    const { startTime, endTime } = schedule[firstActive]!;
    setSchedule((prev) => {
      const next = { ...prev };
      for (const day of DAY_ORDER) {
        if (next[day]?.available) next[day] = { ...next[day]!, startTime, endTime };
      }
      return next;
    });
  }

  // ── Validation ──────────────────────────────────────────────────────────────

  const yearsTrimmed = draft.yearsOfExperience.trim();
  const yearsNum = Number(yearsTrimmed);
  const isYearsValid = yearsTrimmed !== '' && Number.isFinite(yearsNum) && yearsNum >= 0;
  const hasWorkingDay = DAY_ORDER.some((d) => schedule[d]?.available);
  const badHoursDays = DAY_ORDER.filter((d) => schedule[d]?.available && !endsAfterStart(schedule[d]!));
  // What's still missing, in screen order — shown above the disabled
  // Continue so she isn't left guessing.
  const missing: string[] = [];
  if (!draft.bio.trim()) missing.push('a bio');
  if (!isYearsValid) missing.push('your years of experience');
  if (draft.availabilityType === null) missing.push('your availability');
  if (draft.ageRanges.length === 0) missing.push('an age range');
  if (!hasWorkingDay) missing.push('a working day');
  if (badHoursDays.length > 0) missing.push('working hours that end after they start');
  const canContinue = missing.length === 0;

  function handleContinue() {
    if (!draft.bio.trim()) {
      setFormError('Please tell parents a bit about yourself.');
      return;
    }
    if (!isYearsValid) {
      setFormError('Please enter a valid number of years of experience.');
      return;
    }
    if (!draft.availabilityType) {
      setFormError('Please select your availability.');
      return;
    }
    if (draft.ageRanges.length === 0) {
      setFormError('Please pick at least one age range you care for.');
      return;
    }
    if (!hasWorkingDay) {
      setFormError('Please mark at least one day you can work.');
      return;
    }
    if (badHoursDays.length > 0) {
      setFormError('Each working day has to end after it starts.');
      return;
    }
    setFormError(null);
    const next = nextStep('details', draft);
    if (next) router.push(next);
  }

  const certificationOptions = certCatalog ?? [];
  const skillOptions = skillCatalog ?? [];

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <RegistrationHeader step={step} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.stepLabel}>{step.label}</Text>

          <View style={styles.headlineGroup}>
            <Text style={styles.headline}>Tell families about yourself</Text>
            <Text style={styles.subtitle}>
              This becomes part of your public profile once your account is
              approved. You won&apos;t be able to edit it yourself afterward, so
              take your time.
            </Text>
          </View>

          {/* Bio */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Bio</Text>
            <TextInput
              style={styles.textArea}
              value={draft.bio}
              onChangeText={(val) => patch({ bio: val })}
              multiline
              textAlignVertical="top"
              placeholder="Share your experience, approach to childcare, and what makes you a great nanny…"
              placeholderTextColor={colors.textPlaceholder}
            />
          </View>

          {/* Years of experience */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Years of experience</Text>
            <TextInput
              style={styles.input}
              value={draft.yearsOfExperience}
              onChangeText={(val) => patch({ yearsOfExperience: val })}
              keyboardType="number-pad"
              placeholder="e.g. 5"
              placeholderTextColor={colors.textPlaceholder}
            />
          </View>

          {/* Availability */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Availability</Text>
            <View style={styles.availabilityRow}>
              {AVAILABILITY_OPTIONS.map((option) => {
                const isSelected = draft.availabilityType === option.value;
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.availabilityChip, isSelected && styles.availabilityChipSelected]}
                    onPress={() => patch({ availabilityType: option.value })}
                  >
                    <Text
                      style={[
                        styles.availabilityChipText,
                        isSelected && styles.availabilityChipTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Age ranges */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Age ranges you care for</Text>
            <View style={styles.chipsRow}>
              {AGE_RANGES.map((range) => {
                const isSelected = draft.ageRanges.includes(range);
                return (
                  <Pressable
                    key={range}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => toggleAgeRange(range)}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                      {range}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Certifications (optional) */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Certifications (optional)</Text>
            {certificationOptions.length > 0 ? (
              <View style={styles.chipsRow}>
                {certificationOptions.map((cert) => {
                  const isSelected = draft.certificationIds.includes(cert.id);
                  return (
                    <Pressable
                      key={cert.id}
                      style={[styles.chip, isSelected && styles.chipSelected]}
                      onPress={() => toggleCertification(cert.id)}
                    >
                      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                        {cert.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.emptyHint}>No certifications available yet.</Text>
            )}
          </View>

          {/* Skills (optional) */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Skills (optional)</Text>
            {skillOptions.length > 0 ? (
              <View style={styles.chipsRow}>
                {skillOptions.map((skill) => {
                  const isSelected = draft.skillIds.includes(skill.id);
                  return (
                    <Pressable
                      key={skill.id}
                      style={[styles.chip, isSelected && styles.chipSelected]}
                      onPress={() => toggleSkill(skill.id)}
                    >
                      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                        {skill.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.emptyHint}>No skills available yet.</Text>
            )}
          </View>

          {/* Working hours */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Working hours</Text>
            <View style={styles.scheduleCard}>
              {DAY_ORDER.map((day, index) => {
                const slot = schedule[day]!;
                return (
                  <View key={day}>
                    <View style={styles.dayRow}>
                      <Text style={styles.dayLabel}>{DAY_NAMES[day]}</Text>
                      <View style={styles.timePills}>
                        {slot.available ? (
                          <>
                            <Pressable style={styles.timePill} onPress={() => openPicker(day, 'start')}>
                              <Text style={styles.timePillText}>{formatTimeDisplay(slot.startTime)}</Text>
                            </Pressable>
                            <Text style={styles.timeSeparator}>→</Text>
                            <Pressable style={styles.timePill} onPress={() => openPicker(day, 'end')}>
                              <Text style={styles.timePillText}>{formatTimeDisplay(slot.endTime)}</Text>
                            </Pressable>
                          </>
                        ) : (
                          <Text style={styles.dayOffLabel}>Day off</Text>
                        )}
                      </View>
                      <Switch
                        value={slot.available}
                        onValueChange={() => toggleDay(day)}
                        trackColor={{ false: colors.neutralLight, true: colors.primary }}
                        thumbColor={colors.white}
                      />
                    </View>
                    {slot.available && !endsAfterStart(slot) && (
                      <Text style={styles.dayErrorText}>
                        {`${DAY_NAMES[day]} has to end after it starts.`}
                      </Text>
                    )}
                    {index < DAY_ORDER.length - 1 && <View style={styles.dayDivider} />}
                  </View>
                );
              })}
            </View>
            <Pressable style={styles.copyButton} onPress={copyToAllActiveDays}>
              <Ionicons name="copy-outline" size={14} color={colors.primary} />
              <Text style={styles.copyButtonText}>Copy first day&apos;s hours to all active days</Text>
            </Pressable>
          </View>

          {formError && <Text style={styles.errorText}>{formError}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          {!canContinue && (
            <Text style={styles.footerHint}>{`Still needed: ${missing.join(', ')}.`}</Text>
          )}
          <Button title="Continue" onPress={handleContinue} disabled={!canContinue} />
        </View>

        <TimeSelectSheet
          visible={pickerTarget !== null}
          title={pickerTarget?.field === 'start' ? 'Start time' : 'End time'}
          value={
            pickerTarget
              ? schedule[pickerTarget.day]?.[pickerTarget.field === 'start' ? 'startTime' : 'endTime'] ?? '08:00'
              : '08:00'
          }
          onSelect={handleTimeSelect}
          onClose={() => setPickerTarget(null)}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
