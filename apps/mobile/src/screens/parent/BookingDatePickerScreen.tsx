import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StatusBar, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@mobile/theme';
import { BOOKING_DURATION_OPTIONS } from '@mobile/constants';
import {
  isStandardBookingDateAllowed,
  STANDARD_BOOKING_SAME_DAY_MESSAGE,
  doesDurationFitDaySchedule,
  getDayScheduleWindowMinutes,
  BOOKING_OUTSIDE_AVAILABILITY_MESSAGE,
  BOOKING_DAY_TOO_SHORT_MESSAGE,
  BOOKING_START_TOO_LATE_MESSAGE,
} from '@nanny-app/shared';
import { useNannyPublicProfile, useNannyBookedSlots } from '@mobile/hooks/useNannies';
import BookingStepProgress from '@mobile/components/BookingStepProgress';
import { formatHour24 } from '@mobile/lib/formatTime';
import { resolveImageUri } from '@mobile/lib/imageUri';
import { styles } from './styles/booking-date-picker-screen.styles';
import type { TimeSlot } from '@mobile/types';
import type { WeeklySchedule } from '@nanny-app/shared';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function generateSlotsFromSchedule(schedule: WeeklySchedule | null | undefined, dayOfWeek: number): TimeSlot[] {
  if (!schedule) return [];
  const day = schedule[String(dayOfWeek)];
  if (!day || !day.available) return [];

  const startH = parseInt(day.startTime.split(':')[0] ?? '0', 10);
  const endH = parseInt(day.endTime.split(':')[0] ?? '0', 10);

  const slots: TimeSlot[] = [];
  for (let h = startH; h < endH; h++) {
    const hh = String(h).padStart(2, '0');
    const nextHh = String(h + 1).padStart(2, '0');
    slots.push({
      id: `${hh}:00`,
      label: formatHour24(h),
      startTime: `${hh}:00`,
      endTime: `${nextHh}:00`,
      available: true,
    });
  }
  return slots;
}

export default function BookingDatePickerScreen() {
  const router = useRouter();
  const { nannyId, nannyName, nannyPhoto, nannyRate } = useLocalSearchParams<{
    nannyId?: string;
    nannyName?: string;
    nannyPhoto?: string;
    nannyRate?: string;
  }>();

  const { data: nanny, isLoading } = useNannyPublicProfile(nannyId);

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(4);

  const daysInMonth = useMemo(() => getDaysInMonth(currentYear, currentMonth), [currentYear, currentMonth]);
  const firstDay = useMemo(() => getFirstDayOfMonth(currentYear, currentMonth), [currentYear, currentMonth]);

  const isToday = (day: number) =>
    day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();

  const isUnavailable = (day: number) => {
    const date = new Date(currentYear, currentMonth, day);
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    // Standard bookings cannot be same-day; only emergency bookings allow today.
    return date <= todayStart;
  };

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
    setSelectedDay(null);
    setSelectedTimeSlot(null);
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
    setSelectedDay(null);
    setSelectedTimeSlot(null);
  };

  const selectedDateIso = selectedDay !== null
    ? `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
    : null;

  const selectedDayOfWeek = selectedDay !== null
    ? new Date(currentYear, currentMonth, selectedDay).getDay()
    : null;

  const { data: bookedSlots = [], isFetching: fetchingSlots } = useNannyBookedSlots(nannyId, selectedDateIso);

  const bookedSet = useMemo(() => new Set(bookedSlots), [bookedSlots]);

  const availableSlots = useMemo(() => {
    if (selectedDayOfWeek === null) return [];
    const raw = generateSlotsFromSchedule(nanny?.schedule, selectedDayOfWeek);
    return raw.map((s) => ({ ...s, available: !bookedSet.has(s.id) }));
  }, [nanny?.schedule, selectedDayOfWeek, bookedSet]);

  const morningSlots = availableSlots.filter((s) => parseInt(s.startTime) < 12);
  const afternoonSlots = availableSlots.filter((s) => parseInt(s.startTime) >= 12 && parseInt(s.startTime) < 17);
  const eveningSlots = availableSlots.filter((s) => parseInt(s.startTime) >= 17);

  // ── Availability-window validation ──────────────────────────────────────────
  // Booking hours are compared under the SAME wall-clock/UTC convention used to
  // build the ISO strings below — no local-time conversion.
  const selectedSlot = useMemo(
    () => availableSlots.find((s) => s.id === selectedTimeSlot) ?? null,
    [availableSlots, selectedTimeSlot],
  );

  const slotStartMinutes = useMemo(() => {
    if (!selectedSlot) return null;
    const [hh, mm] = selectedSlot.startTime.split(':');
    return parseInt(hh ?? '0', 10) * 60 + parseInt(mm ?? '0', 10);
  }, [selectedSlot]);

  // A duration option is available only once a start slot is chosen and the
  // resulting end stays within the nanny's window for the selected day.
  const isDurationAvailable = (hrs: number): boolean => {
    if (slotStartMinutes === null || selectedDayOfWeek === null) return true;
    return doesDurationFitDaySchedule(nanny?.schedule, selectedDayOfWeek, slotStartMinutes, hrs);
  };

  const anyDurationFits = useMemo(() => {
    if (slotStartMinutes === null || selectedDayOfWeek === null) return true;
    return BOOKING_DURATION_OPTIONS.some((hrs) =>
      doesDurationFitDaySchedule(nanny?.schedule, selectedDayOfWeek, slotStartMinutes, hrs),
    );
  }, [slotStartMinutes, selectedDayOfWeek, nanny?.schedule]);

  const dayWindowMinutes = useMemo(
    () => (selectedDayOfWeek === null ? null : getDayScheduleWindowMinutes(nanny?.schedule, selectedDayOfWeek)),
    [selectedDayOfWeek, nanny?.schedule],
  );

  // Message shown when the chosen slot admits no valid duration: distinguish a
  // genuinely too-short day from a start time that is simply too late.
  const smallestDuration = BOOKING_DURATION_OPTIONS[0];
  const noDurationFitsMessage = selectedSlot && !anyDurationFits
    ? (dayWindowMinutes !== null && dayWindowMinutes < smallestDuration * 60
        ? BOOKING_DAY_TOO_SHORT_MESSAGE
        : BOOKING_START_TOO_LATE_MESSAGE)
    : null;

  // Backstop error surfaced on a blocked Continue press; cleared whenever the
  // selection (slot / duration / day) changes.
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  useEffect(() => {
    setAvailabilityError(null);
  }, [selectedTimeSlot, selectedDuration, selectedDay]);

  const canContinue = selectedDay !== null && selectedTimeSlot !== null;

  const handleContinue = () => {
    if (!canContinue || selectedDay === null) return;
    const dateIso = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
    if (!isStandardBookingDateAllowed(dateIso)) return;

    const slot = availableSlots.find((s) => s.id === selectedTimeSlot);
    if (!slot) return;

    // Backstop: block navigation if the selected duration escapes the window.
    if (!isDurationAvailable(selectedDuration)) {
      setAvailabilityError(BOOKING_OUTSIDE_AVAILABILITY_MESSAGE);
      return;
    }

    const [startHH, startMM] = slot.startTime.split(':');
    const endHour = parseInt(startHH ?? '0', 10) + selectedDuration;
    const endMinute = parseInt(startMM ?? '0', 10);
    const endTimeStr = `${String(endHour).padStart(2, '0')}:${startMM ?? '00'}`;
    const startTimeIso = `${dateIso}T${slot.startTime}:00+00:00`;
    const endTimeIso = `${dateIso}T${endTimeStr}:00+00:00`;
    const resolvedPhoto = resolveImageUri(nannyPhoto) ?? resolveImageUri(nanny?.avatarUrl);
    router.push({
      pathname: '/(parent)/book/booking-step-1',
      params: {
        nannyProfileId: nannyId ?? '',
        date: `${MONTHS[currentMonth].slice(0, 3)} ${selectedDay}`,
        startTime: slot.label,
        endTime: formatHour24(endHour, endMinute),
        dateIso,
        startTimeIso,
        endTimeIso,
        nannyName: nannyName ?? '',
        ...(resolvedPhoto ? { nannyPhoto: resolvedPhoto } : {}),
        nannyRate: nannyRate ?? String(nanny?.hourlyRate ?? ''),
      },
    } as never);
  };

  const renderTimeSlotGroup = (label: string, slots: TimeSlot[]) => {
    if (slots.length === 0) return null;
    return (
      <View style={styles.timeSlotSection}>
        <Text style={styles.timePeriodLabel}>{label}</Text>
        <View style={styles.timeSlotsRow}>
          {slots.map((slot) => {
            const isSelected = selectedTimeSlot === slot.id;
            return (
              <Pressable
                key={slot.id}
                style={[
                  styles.timeSlot,
                  isSelected && styles.timeSlotSelected,
                  !slot.available && styles.timeSlotDisabled,
                ]}
                onPress={() => slot.available && setSelectedTimeSlot(slot.id)}
                disabled={!slot.available}
              >
                <Text style={[styles.timeSlotText, isSelected && styles.timeSlotTextSelected]}>
                  {slot.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <BookingStepProgress step={1} title="Select date & time" centered />

        <Text style={styles.advanceNotice}>{STANDARD_BOOKING_SAME_DAY_MESSAGE}</Text>

        {/* Calendar */}
        <View>
          <View style={styles.calendarHeader}>
            <Pressable style={styles.calendarNavButton} onPress={handlePrevMonth}>
              <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.calendarMonth}>{MONTHS[currentMonth]} {currentYear}</Text>
            <Pressable style={styles.calendarNavButton} onPress={handleNextMonth}>
              <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((d) => (
              <Text key={d} style={styles.weekdayLabel}>{d}</Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {Array.from({ length: firstDay }).map((_, i) => (
              <View key={`empty-${i}`} style={styles.dayCell} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const unavailable = isUnavailable(day);
              const selected = selectedDay === day;
              const todayMark = isToday(day);
              return (
                <Pressable
                  key={day}
                  style={styles.dayCell}
                  onPress={() => {
                    if (!unavailable) {
                      setSelectedDay(day);
                      setSelectedTimeSlot(null);
                    }
                  }}
                  disabled={unavailable}
                >
                  <View style={[selected && styles.daySelected, todayMark && !selected && !unavailable && styles.dayToday]}>
                    <Text style={[styles.dayText, unavailable && styles.dayTextDisabled, selected && styles.dayTextSelected]}>
                      {day}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Time Slots */}
        <View>
          <Text style={styles.sectionTitle}>Select time</Text>
          {isLoading || fetchingSlots ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
          ) : selectedDay === null ? (
            <Text style={{ color: colors.textMuted, textAlign: 'center', marginVertical: 16 }}>
              Select a date to see available times
            </Text>
          ) : availableSlots.length === 0 ? (
            <Text style={{ color: colors.textMuted, textAlign: 'center', marginVertical: 16 }}>
              Nanny is not available on this day
            </Text>
          ) : availableSlots.every((s) => !s.available) ? (
            <Text style={{ color: colors.textMuted, textAlign: 'center', marginVertical: 16 }}>
              All slots are booked for this day
            </Text>
          ) : (
            <>
              {renderTimeSlotGroup('Morning', morningSlots)}
              {renderTimeSlotGroup('Afternoon', afternoonSlots)}
              {renderTimeSlotGroup('Evening', eveningSlots)}
            </>
          )}
        </View>

        {/* Duration */}
        <View>
          <Text style={styles.sectionTitle}>Duration</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.durationRow}>
              {BOOKING_DURATION_OPTIONS.map((hrs) => {
                const isSelected = selectedDuration === hrs;
                const disabled = !isDurationAvailable(hrs);
                return (
                  <Pressable
                    key={hrs}
                    style={[
                      styles.durationChip,
                      isSelected && styles.durationChipSelected,
                      disabled && styles.durationChipDisabled,
                    ]}
                    onPress={() => {
                      if (!disabled) setSelectedDuration(hrs);
                    }}
                    disabled={disabled}
                  >
                    <Text style={[styles.durationChipText, isSelected && styles.durationChipTextSelected]}>
                      {hrs} hours
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          {noDurationFitsMessage ? (
            <Text style={styles.availabilityError}>{noDurationFitsMessage}</Text>
          ) : availabilityError ? (
            <Text style={styles.availabilityError}>{availabilityError}</Text>
          ) : null}
        </View>
      </ScrollView>

      {/* Header */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Select date & time</Text>
          <View style={styles.iconBtn} />
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Pressable
          style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={!canContinue}
        >
          <Text style={styles.continueButtonText}>Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}
