import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { AvailabilityType } from '@nanny-app/shared';
import type { AvailabilityType as AvailabilityTypeValue, WeeklySchedule } from '@nanny-app/shared';
import { colors } from '@mobile/theme';
import { APP_NAME } from '@mobile/constants';
import Button from '@mobile/components/ui/button';
import TimeSelectSheet, { formatTimeDisplay } from '@mobile/components/TimeSelectSheet';
import { useCertificationCatalog, useSkillCatalog } from '@mobile/hooks/useNannies';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { styles } from './styles/registration-nanny-details-screen.styles';

// Nanny-only step: collects the professional-profile fields that become part
// of the (read-only, admin-editable) public profile once approved. Inserted
// between register-nanny-id and register-step-3. Mirrors the field set +
// working-hours pattern in NannyProfileEditScreen (which edits the same data
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

function uiScheduleToApi(schedule: Record<number, DaySchedule>): WeeklySchedule {
  const result: WeeklySchedule = {};
  for (const [day, slot] of Object.entries(schedule)) {
    result[day] = slot;
  }
  return result;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const AGE_RANGE_OPTIONS = ['0-1', '1-3', '3-5', '5+'];

const AVAILABILITY_OPTIONS: { label: string; value: AvailabilityTypeValue }[] = [
  { label: 'Full-time', value: AvailabilityType.FULL_TIME },
  { label: 'Part-time', value: AvailabilityType.PART_TIME },
  { label: 'Occasional', value: AvailabilityType.OCCASIONAL },
];

export default function RegistrationNannyDetailsScreen() {
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role?: string }>();

  const draft = useRegistrationDraftStore();
  const patch = useRegistrationDraftStore((s) => s.patch);

  const { data: certCatalog } = useCertificationCatalog();
  const { data: skillCatalog } = useSkillCatalog();

  const [formError, setFormError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<Record<number, DaySchedule>>(() =>
    apiScheduleToUi(draft.schedule),
  );
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);

  // Keep the draft's schedule in sync so it's always ready to send, even
  // though working hours are optional and seeded from DEFAULT_SCHEDULE.
  useEffect(() => {
    patch({ schedule: uiScheduleToApi(schedule) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule]);

  function handleBack() {
    router.back();
  }

  function toggleAgeRange(range: string) {
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
  const canContinue = draft.bio.trim().length > 0 && isYearsValid && draft.availabilityType !== null;

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
    setFormError(null);
    router.push({ pathname: '/(auth)/register-step-3', params: { role } });
  }

  const certificationOptions = certCatalog ?? [];
  const skillOptions = skillCatalog ?? [];

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />

        {/* Fixed header bar */}
        <View style={styles.headerBar}>
          <View style={styles.headerLeft}>
            <Pressable style={styles.backButton} onPress={handleBack} hitSlop={8}>
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.brandText}>{APP_NAME}</Text>
          </View>
          <View style={styles.miniProgressTrack}>
            <View style={styles.miniProgressFill} />
          </View>
        </View>

        {/* Full-width progress bar */}
        <View style={styles.progressBarTrack}>
          <View style={styles.progressBarFill} />
        </View>

        {/* Scrollable body */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Step label */}
          <Text style={styles.stepLabel}>STEP 5 OF 5 — PROFESSIONAL DETAILS</Text>

          {/* Section title */}
          <Text style={styles.sectionTitle}>Tell families about yourself</Text>
          <Text style={styles.sectionSubtitle}>
            This becomes part of your public profile once your account is
            approved. You won&apos;t be able to edit it yourself afterward, so
            take your time.
          </Text>

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

          {/* Age ranges (optional) */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Age ranges you care for (optional)</Text>
            <View style={styles.chipsRow}>
              {AGE_RANGE_OPTIONS.map((range) => {
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

          {/* Working hours (optional) */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Working hours (optional)</Text>
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

        {/* Fixed footer */}
        <View style={styles.footer}>
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
