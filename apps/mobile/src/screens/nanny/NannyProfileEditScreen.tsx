import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Modal,
  ActivityIndicator,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@mobile/theme';
import { styles } from './styles/nanny-profile-edit-screen.styles';
import { useNannyProfile, useUpdateNannyProfile } from '@mobile/hooks/useNannyProfile';
import { AvailabilityType } from '@nanny-app/shared';
import type { AvailabilityType as AvailabilityTypeValue, WeeklySchedule } from '@nanny-app/shared';

// ─── Working hours types & helpers ───────────────────────────────────────────

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

function formatTime(hhmm: string): string {
  const parts = hhmm.split(':');
  const h = parseInt(parts[0] ?? '8', 10);
  const m = parseInt(parts[1] ?? '0', 10);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

function timeToDate(hhmm: string): Date {
  const parts = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(parts[0] ?? 8, parts[1] ?? 0, 0, 0);
  return d;
}

function dateToTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const AGE_RANGE_OPTIONS = ['0-1', '1-3', '3-5', '5+'];

const AVAILABILITY_OPTIONS: { label: string; value: AvailabilityTypeValue }[] = [
  { label: 'Full-time', value: AvailabilityType.FULL_TIME },
  { label: 'Part-time', value: AvailabilityType.PART_TIME },
  { label: 'Occasional', value: AvailabilityType.OCCASIONAL },
];

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function NannyProfileEditScreen() {
  const router = useRouter();
  const { data: nannyProfile, isLoading } = useNannyProfile();
  const updateProfile = useUpdateNannyProfile();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [experience, setExperience] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [certifications, setCertifications] = useState<string[]>([]);
  const [newCert, setNewCert] = useState('');
  const [showCertInput, setShowCertInput] = useState(false);
  const [selectedAgeRanges, setSelectedAgeRanges] = useState<string[]>([]);
  const [availabilityType, setAvailabilityType] = useState<AvailabilityTypeValue>(AvailabilityType.OCCASIONAL);

  const [schedule, setSchedule] = useState<Record<number, DaySchedule>>(
    () => structuredClone(DEFAULT_SCHEDULE),
  );
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [pickerDate, setPickerDate] = useState(new Date());

  // Populate form when profile data loads
  useEffect(() => {
    if (!nannyProfile) return;
    setFirstName(nannyProfile.firstName);
    setLastName(nannyProfile.lastName);
    setBio(nannyProfile.bio ?? '');
    setLocation(nannyProfile.location ?? '');
    setExperience(nannyProfile.yearsOfExperience?.toString() ?? '');
    setHourlyRate(nannyProfile.hourlyRate?.toString() ?? '');
    setCertifications(nannyProfile.certifications);
    setSelectedAgeRanges(nannyProfile.ageRanges);
    setAvailabilityType(nannyProfile.availabilityType);
    setSchedule(apiScheduleToUi(nannyProfile.schedule));
  }, [nannyProfile]);

  const handleRemoveCert = (cert: string) => {
    setCertifications((prev) => prev.filter((c) => c !== cert));
  };

  const handleAddCert = () => {
    const trimmed = newCert.trim();
    if (trimmed && !certifications.includes(trimmed)) {
      setCertifications((prev) => [...prev, trimmed]);
    }
    setNewCert('');
    setShowCertInput(false);
  };

  const toggleAgeRange = (range: string) => {
    setSelectedAgeRanges((prev) =>
      prev.includes(range) ? prev.filter((r) => r !== range) : [...prev, range],
    );
  };

  const handleSave = () => {
    updateProfile.mutate({
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
      bio: bio || undefined,
      location: location || undefined,
      yearsOfExperience: experience ? parseInt(experience, 10) : undefined,
      hourlyRate: hourlyRate ? parseFloat(hourlyRate) : undefined,
      certifications,
      ageRanges: selectedAgeRanges,
      availabilityType,
      schedule: uiScheduleToApi(schedule),
    });
  };

  // ── Working hours handlers ─────────────────────────────────────────────────

  const toggleDay = (day: number) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: { ...prev[day]!, available: !prev[day]!.available },
    }));
  };

  const openPicker = (day: number, field: 'start' | 'end') => {
    const slot = schedule[day];
    if (!slot) return;
    setPickerDate(timeToDate(field === 'start' ? slot.startTime : slot.endTime));
    setPickerTarget({ day, field });
  };

  const onTimeChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (!selected || !pickerTarget) return;
    setPickerDate(selected);
    const time = dateToTime(selected);
    setSchedule((prev) => ({
      ...prev,
      [pickerTarget.day]: {
        ...prev[pickerTarget.day]!,
        ...(pickerTarget.field === 'start' ? { startTime: time } : { endTime: time }),
      },
    }));
    if (Platform.OS === 'android') setPickerTarget(null);
  };

  const copyToAllActiveDays = () => {
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
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Photo */}
        <View style={styles.photoSection}>
          <Pressable style={styles.photoWrapper}>
            {nannyProfile?.avatarUrl ? (
              <Image source={{ uri: nannyProfile.avatarUrl }} style={styles.photo} resizeMode="cover" />
            ) : (
              <View style={[styles.photo, { backgroundColor: colors.taupe, alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="person" size={40} color={colors.textPlaceholder} />
              </View>
            )}
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={14} color={colors.white} />
            </View>
          </Pressable>
          <Pressable>
            <Text style={styles.changePhotoText}>Change photo</Text>
          </Pressable>
        </View>

        {/* Basic Info */}
        <View style={styles.formSection}>
          <Text style={styles.sectionLabel}>Basic information</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>First name</Text>
            <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Last name</Text>
            <TextInput style={styles.input} value={lastName} onChangeText={setLastName} autoCapitalize="words" />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Bio</Text>
            <TextInput
              style={styles.textArea}
              value={bio}
              onChangeText={setBio}
              multiline
              textAlignVertical="top"
              placeholder="Tell parents about yourself..."
              placeholderTextColor={colors.textPlaceholder}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Location</Text>
            <TextInput style={styles.input} value={location} onChangeText={setLocation} autoCapitalize="words" />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Years of experience</Text>
            <TextInput style={styles.input} value={experience} onChangeText={setExperience} keyboardType="number-pad" />
          </View>
        </View>

        {/* Rates */}
        <View style={styles.formSection}>
          <Text style={styles.sectionLabel}>Rates</Text>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Hourly rate</Text>
            <View style={styles.rateInputRow}>
              <Text style={styles.ratePrefix}>$</Text>
              <TextInput style={styles.rateInput} value={hourlyRate} onChangeText={setHourlyRate} keyboardType="decimal-pad" />
              <Text style={styles.rateUnit}>/hr</Text>
            </View>
          </View>
        </View>

        {/* Certifications */}
        <View style={styles.formSection}>
          <Text style={styles.sectionLabel}>Certifications</Text>
          <View style={styles.certsRow}>
            {certifications.map((cert) => (
              <View key={cert} style={styles.certChip}>
                <Text style={styles.certChipText}>{cert}</Text>
                <Pressable onPress={() => handleRemoveCert(cert)} hitSlop={4}>
                  <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
            {showCertInput ? (
              <View style={styles.certChip}>
                <TextInput
                  autoFocus
                  style={[styles.certChipText, { minWidth: 80 }]}
                  value={newCert}
                  onChangeText={setNewCert}
                  onSubmitEditing={handleAddCert}
                  onBlur={handleAddCert}
                  placeholder="Type & press enter"
                  placeholderTextColor={colors.textPlaceholder}
                  returnKeyType="done"
                />
              </View>
            ) : (
              <Pressable style={styles.addCertButton} onPress={() => setShowCertInput(true)}>
                <Ionicons name="add" size={14} color={colors.primary} />
                <Text style={styles.addCertText}>Add</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Age Range */}
        <View style={styles.formSection}>
          <Text style={styles.sectionLabel}>Age range</Text>
          <View style={styles.ageChipsRow}>
            {AGE_RANGE_OPTIONS.map((range) => {
              const isSelected = selectedAgeRanges.includes(range);
              return (
                <Pressable
                  key={range}
                  style={[styles.ageChip, isSelected && styles.ageChipSelected]}
                  onPress={() => toggleAgeRange(range)}
                >
                  <Text style={[styles.ageChipText, isSelected && styles.ageChipTextSelected]}>
                    {range}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Availability Type */}
        <View style={styles.formSection}>
          <Text style={styles.sectionLabel}>Availability</Text>
          <View style={styles.availabilityRow}>
            {AVAILABILITY_OPTIONS.map((option) => {
              const isSelected = availabilityType === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.availabilityChip, isSelected && styles.availabilityChipSelected]}
                  onPress={() => setAvailabilityType(option.value)}
                >
                  <Text style={[styles.availabilityChipText, isSelected && styles.availabilityChipTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Working Hours */}
        <View style={styles.formSection}>
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
                            <Text style={styles.timePillText}>{formatTime(slot.startTime)}</Text>
                          </Pressable>
                          <Text style={styles.timeSeparator}>→</Text>
                          <Pressable style={styles.timePill} onPress={() => openPicker(day, 'end')}>
                            <Text style={styles.timePillText}>{formatTime(slot.endTime)}</Text>
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
            <Text style={styles.copyButtonText}>Copy first day's hours to all active days</Text>
          </Pressable>
        </View>

        {/* Save */}
        <Pressable
          style={[styles.saveButton, updateProfile.isPending && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={updateProfile.isPending}
        >
          {updateProfile.isPending ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.saveButtonText}>Save changes</Text>
          )}
        </Pressable>

        {updateProfile.isError && (
          <Text style={{ color: colors.error, textAlign: 'center', marginTop: 8 }}>
            {updateProfile.error instanceof Error ? updateProfile.error.message : 'Failed to save.'}
          </Text>
        )}


        {/* Sign out */}
        <Pressable
          style={[styles.saveButton, { backgroundColor: colors.taupe, marginTop: 0 }]}
          onPress={() => router.replace('/(auth)/splash')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="log-out-outline" size={18} color={colors.error} />
            <Text style={[styles.saveButtonText, { color: colors.error }]}>Sign out</Text>
          </View>
        </Pressable>
      </ScrollView>

      {/* Header */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <View style={styles.iconBtn} />
          <Text style={styles.headerTitle}>Edit profile</Text>
          <Pressable style={styles.iconBtn} onPress={handleSave} disabled={updateProfile.isPending}>
            <Text style={styles.saveText}>Save</Text>
          </Pressable>
        </View>
      </View>

      {/* Time picker — Android shows as native dialog */}
      {pickerTarget !== null && Platform.OS === 'android' && (
        <DateTimePicker
          value={pickerDate}
          mode="time"
          is24Hour={false}
          display="clock"
          onChange={onTimeChange}
        />
      )}

      {/* Time picker — iOS shows in a bottom sheet modal */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={pickerTarget !== null}
          transparent
          animationType="slide"
          onRequestClose={() => setPickerTarget(null)}
        >
          <View style={styles.pickerOverlay}>
            <Pressable style={{ flex: 1 }} onPress={() => setPickerTarget(null)} />
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>
                  {pickerTarget?.field === 'start' ? 'Start time' : 'End time'}
                </Text>
                <Pressable onPress={() => setPickerTarget(null)} hitSlop={12}>
                  <Text style={styles.pickerDone}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={pickerDate}
                mode="time"
                is24Hour={false}
                display="spinner"
                onChange={onTimeChange}
                style={{ height: 200 }}
              />
            </View>
          </View>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
}
