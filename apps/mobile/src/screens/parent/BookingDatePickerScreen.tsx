import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StatusBar, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@mobile/theme';
import {
  bookingWindowLengthHours,
  careDayWallClock,
  generateCareDaySlots,
  type BookingOptions,
  type CareDaySlot,
} from '@nanny-app/shared';
import BookingStepProgress from '@mobile/components/BookingStepProgress';
import { fmtBookingDate, useBookingOptions } from '@mobile/hooks/useBookings';
import { formatHour24 } from '@mobile/lib/formatTime';
import { styles } from './styles/booking-date-picker-screen.styles';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Slots are grouped by time of day for scanning. Which groups appear, and in
 * what order, follows the configured window rather than this list — see
 * groupSlots.
 */
const PERIODS = [
  { label: 'Late night', from: 0, to: 5 },
  { label: 'Morning', from: 6, to: 11 },
  { label: 'Afternoon', from: 12, to: 16 },
  { label: 'Evening', from: 17, to: 23 },
] as const;

type SlotGroup = { key: string; label: string; slots: CareDaySlot[] };

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function toDateIso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * A slot can be offered only once the minimum advance notice has passed. Both
 * sides are fixed-width platform wall-clock, so comparing the strings compares
 * the times — no timezone maths on the device, and no reliance on its clock.
 */
function isSlotBookable(slot: CareDaySlot, options: BookingOptions): boolean {
  return slot.startWall >= options.earliestStartWallClock;
}

function careDaySlots(dateIso: string, options: BookingOptions): CareDaySlot[] {
  return generateCareDaySlots(
    dateIso,
    options.bookingWindowStartHour,
    options.bookingWindowEndHour,
    options.minBookingHours,
  );
}

/**
 * Buckets slots by date and time of day, in chronological order.
 *
 * Keyed on the date as well as the period because a window that runs past
 * midnight puts some slots on the following day: those must read as "Late night
 * (Tue, Jul 21)" and sit at the BOTTOM of the list, even though 00:00 is the
 * lowest wall-clock hour on the screen. Slots arrive ordered by `absHour` —
 * hours since the care-day began — so first-appearance order is already right
 * and nothing needs sorting.
 */
function groupSlots(slots: CareDaySlot[], careDayIso: string): SlotGroup[] {
  const groups: SlotGroup[] = [];
  for (const slot of slots) {
    const period = PERIODS.find((p) => slot.hour >= p.from && slot.hour <= p.to);
    if (!period) continue;
    const key = `${slot.dateIso}|${period.label}`;
    const existing = groups.find((g) => g.key === key);
    if (existing) {
      existing.slots.push(slot);
      continue;
    }
    groups.push({
      key,
      // Spell out the date when a slot isn't on the day the parent tapped.
      label:
        slot.dateIso === careDayIso
          ? period.label
          : `${period.label} (${fmtBookingDate(slot.dateIso)})`,
      slots: [slot],
    });
  }
  return groups;
}

export default function BookingDatePickerScreen() {
  const router = useRouter();
  const { data: options, isLoading, error } = useBookingOptions();

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);

  const daysInMonth = useMemo(
    () => getDaysInMonth(currentYear, currentMonth),
    [currentYear, currentMonth],
  );
  const firstDay = useMemo(
    () => getFirstDayOfMonth(currentYear, currentMonth),
    [currentYear, currentMonth],
  );

  const windowLength = options
    ? bookingWindowLengthHours(options.bookingWindowStartHour, options.bookingWindowEndHour)
    : 0;

  const isToday = (day: number) =>
    day === today.getDate() &&
    currentMonth === today.getMonth() &&
    currentYear === today.getFullYear();

  /**
   * Which days in this month have at least one slot left. Today is now
   * genuinely bookable once the lead time allows it — and with a window that
   * runs past midnight, so is YESTERDAY late at night, because its after-midnight
   * slots are still in the future.
   */
  const bookableDays = useMemo(() => {
    const days = new Set<number>();
    if (!options) return days;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateIso = toDateIso(currentYear, currentMonth, day);
      if (careDaySlots(dateIso, options).some((slot) => isSlotBookable(slot, options))) {
        days.add(day);
      }
    }
    return days;
  }, [options, currentYear, currentMonth, daysInMonth]);

  const selectedDateIso =
    selectedDay === null ? null : toDateIso(currentYear, currentMonth, selectedDay);

  const slotGroups = useMemo(() => {
    if (!options || !selectedDateIso) return [];
    return groupSlots(careDaySlots(selectedDateIso, options), selectedDateIso);
  }, [options, selectedDateIso]);

  const selectedSlot = useMemo(() => {
    if (selectedSlotId === null) return null;
    for (const group of slotGroups) {
      const found = group.slots.find((s) => s.absHour === selectedSlotId);
      if (found) return found;
    }
    return null;
  }, [slotGroups, selectedSlotId]);

  /** Every booking length the configured limits allow, before the slot narrows it. */
  const durationOptions = useMemo(() => {
    if (!options) return [];
    const longest = Math.min(options.maxBookingHours, windowLength);
    const list: number[] = [];
    for (let hours = options.minBookingHours; hours <= longest; hours++) list.push(hours);
    return list;
  }, [options, windowLength]);

  /** Of those, the ones that still end before the window closes from this slot. */
  const availableDurations = useMemo(() => {
    if (!options || !selectedSlot) return durationOptions;
    const offset = selectedSlot.absHour - options.bookingWindowStartHour;
    return durationOptions.filter((hours) => offset + hours <= windowLength);
  }, [durationOptions, options, selectedSlot, windowLength]);

  /**
   * Falls back when the chosen length no longer fits — picking a late slot with
   * "8 hours" already selected would otherwise just disable Continue with no
   * explanation. Prefers 4 hours, as the old picker defaulted to.
   */
  const duration = useMemo(() => {
    if (selectedDuration !== null && availableDurations.includes(selectedDuration)) {
      return selectedDuration;
    }
    return availableDurations.find((h) => h === 4) ?? availableDurations[0] ?? null;
  }, [selectedDuration, availableDurations]);

  const resetSelection = () => {
    setSelectedDay(null);
    setSelectedSlotId(null);
  };

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
    resetSelection();
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
    resetSelection();
  };

  // `duration` is always drawn from availableDurations, so it can't be a length
  // that doesn't fit — there's nothing further to check here.
  const canContinue = !!options && !!selectedSlot && !!selectedDateIso && duration !== null;

  const handleContinue = () => {
    if (!canContinue || !selectedSlot || !selectedDateIso || duration === null) return;

    // Both built from the care-day + hours-since-it-began, so a slot that runs
    // past midnight lands on the next date automatically and an end at midnight
    // comes out as T00:00:00 the following day rather than T24:00:00.
    const startTimeWall = selectedSlot.startWall;
    const endTimeWall = careDayWallClock(selectedDateIso, selectedSlot.absHour + duration);

    router.push({
      pathname: '/(parent)/book/booking-step-1',
      params: {
        // The date the booking actually STARTS — which for a late-night slot is
        // the day after the one tapped. The server derives its own from the
        // start time; this is only for display.
        dateIso: selectedSlot.dateIso,
        startTimeWall,
        endTimeWall,
        durationHours: String(duration),
      },
    } as never);
  };

  const renderSlotGroup = (group: SlotGroup) => (
    <View key={group.key} style={styles.timeSlotSection}>
      <Text style={styles.timePeriodLabel}>{group.label}</Text>
      <View style={styles.timeSlotsRow}>
        {group.slots.map((slot) => {
          const isSelected = selectedSlotId === slot.absHour;
          const disabled = !options || !isSlotBookable(slot, options);
          return (
            <Pressable
              key={slot.absHour}
              style={[
                styles.timeSlot,
                isSelected && styles.timeSlotSelected,
                disabled && styles.timeSlotDisabled,
              ]}
              onPress={() => setSelectedSlotId(slot.absHour)}
              disabled={disabled}
            >
              <Text style={[styles.timeSlotText, isSelected && styles.timeSlotTextSelected]}>
                {formatHour24(slot.hour)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const renderSlots = () => {
    if (selectedDay === null) {
      return <Text style={styles.slotsPlaceholder}>Select a date to see available times</Text>;
    }
    if (slotGroups.length === 0) {
      return <Text style={styles.slotsPlaceholder}>No times are available on this date.</Text>;
    }
    return <>{slotGroups.map(renderSlotGroup)}</>;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <BookingStepProgress step={1} title="When do you need care?" centered />

        {isLoading && <ActivityIndicator color={colors.primary} />}
        {error != null && (
          <Text style={styles.availabilityError}>
            Couldn’t load available times. Pull back and try again.
          </Text>
        )}

        {options && (
          <>
            <Text style={styles.advanceNotice}>
              {options.minAdvanceBookingHours > 0
                ? `Book at least ${options.minAdvanceBookingHours} ${
                    options.minAdvanceBookingHours === 1 ? 'hour' : 'hours'
                  } ahead. Care runs ${formatHour24(options.bookingWindowStartHour)} to ${formatHour24(
                    options.bookingWindowEndHour,
                  )}.`
                : `Care runs ${formatHour24(options.bookingWindowStartHour)} to ${formatHour24(
                    options.bookingWindowEndHour,
                  )}.`}
            </Text>

            {/* Calendar */}
            <View>
              <View style={styles.calendarHeader}>
                <Pressable style={styles.calendarNavButton} onPress={handlePrevMonth}>
                  <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
                </Pressable>
                <Text style={styles.calendarMonth}>
                  {MONTHS[currentMonth]} {currentYear}
                </Text>
                <Pressable style={styles.calendarNavButton} onPress={handleNextMonth}>
                  <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
                </Pressable>
              </View>

              <View style={styles.weekdayRow}>
                {WEEKDAYS.map((d) => (
                  <Text key={d} style={styles.weekdayLabel}>
                    {d}
                  </Text>
                ))}
              </View>

              <View style={styles.calendarGrid}>
                {Array.from({ length: firstDay }).map((_, i) => (
                  <View key={`empty-${i}`} style={styles.dayCell} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const unavailable = !bookableDays.has(day);
                  const selected = selectedDay === day;
                  const todayMark = isToday(day);
                  return (
                    <Pressable
                      key={day}
                      style={styles.dayCell}
                      onPress={() => {
                        if (unavailable) return;
                        setSelectedDay(day);
                        setSelectedSlotId(null);
                      }}
                      disabled={unavailable}
                    >
                      <View
                        style={[
                          selected && styles.daySelected,
                          todayMark && !selected && !unavailable && styles.dayToday,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayText,
                            unavailable && styles.dayTextDisabled,
                            selected && styles.dayTextSelected,
                          ]}
                        >
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
              {renderSlots()}
            </View>

            {/* Duration */}
            <View>
              <Text style={styles.sectionTitle}>Duration</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.durationRow}>
                  {durationOptions.map((hrs) => {
                    const isSelected = duration === hrs;
                    // Shown but greyed out, so it stays visible that a longer
                    // booking exists and is simply too late in the day for it.
                    const disabled = !availableDurations.includes(hrs);
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
                        <Text
                          style={[
                            styles.durationChipText,
                            isSelected && styles.durationChipTextSelected,
                          ]}
                        >
                          {hrs} hours
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          </>
        )}
      </ScrollView>

      {/* Header */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Book care</Text>
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
