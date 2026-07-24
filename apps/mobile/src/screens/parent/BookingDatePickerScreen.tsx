import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@mobile/theme';
import {
  addDaysIso,
  bookingWindowLengthHours,
  calculatePriceBreakdown,
  generateCareDaySlots,
  isBookingWithinDailyWindow,
  resolveDurationMultiplier,
  type BookingOptions,
  type CareDaySlot,
} from '@nanny-app/shared';
import BookingStepProgress from '@mobile/components/BookingStepProgress';
import BookingSummaryBar from '@mobile/components/BookingSummaryBar';
import { Stepper } from '@mobile/components/ui';
import { fmtBookingDate, useBookingOptions, usePricingConfig } from '@mobile/hooks/useBookings';
import { formatMoney } from '@mobile/lib/formatMoney';
import { formatBookingTime, formatDurationHours, formatHour24 } from '@mobile/lib/formatTime';
import { styles } from './styles/booking-date-picker-screen.styles';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** How many days the horizontal rail offers before the mother needs the grid. */
const RAIL_DAYS = 30;

/**
 * Care is booked in whole hours. The START may fall on any minute, but the
 * LENGTH is always a round number of hours — so a 9:20 start runs to 13:20, not
 * 13:50.
 */
const DURATION_STEP_MINUTES = 60;

/** Start times are offered every 5 minutes — the stepper walks one notch at a time. */
const START_STEP_MINUTES = 5;

/** Durations offered as one-tap shortcuts; the stepper covers everything else. */
const QUICK_DURATION_HOURS = [2, 3, 4, 6, 8];

type RailDay = {
  dateIso: string;
  year: number;
  month: number;
  day: number;
  weekday: string;
  /** "Today" / "Tomorrow", else null. */
  relative: string | null;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function toDateIso(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

/**
 * Shifts a wall-clock string by whole minutes, rolling the date over midnight.
 *
 * Pure calendar arithmetic on the string — never `new Date`, which would parse
 * it in the DEVICE's timezone and land an hour out on a DST boundary. The
 * server does the timezone conversion; the client only ever moves wall time.
 */
function addMinutesToWall(wall: string, minutes: number): string {
  const dateIso = wall.slice(0, 10);
  const total = Number(wall.slice(11, 13)) * 60 + Number(wall.slice(14, 16)) + minutes;
  const dayShift = Math.floor(total / 1440);
  const rem = ((total % 1440) + 1440) % 1440;
  return `${addDaysIso(dateIso, dayShift)}T${pad2(Math.floor(rem / 60))}:${pad2(rem % 60)}:00`;
}

/** Replaces the time-of-day on a wall-clock string, keeping its date. */
function withTimeOfDay(wall: string, hour: number, minute: number): string {
  return `${wall.slice(0, 10)}T${pad2(hour)}:${pad2(minute)}:00`;
}

/** "270" → "4h 30m". Thin wrapper so the screen can stay in minutes throughout. */
function formatMinutes(minutes: number): string {
  return formatDurationHours(minutes / 60);
}

/**
 * A slot can be offered only once the minimum advance notice has passed. Both
 * sides are fixed-width platform wall-clock, so comparing the strings compares
 * the times — no timezone maths on the device, and no reliance on its clock.
 */
function isStartBookable(startWall: string, options: BookingOptions): boolean {
  return startWall >= options.earliestStartWallClock;
}

function careDaySlots(dateIso: string, options: BookingOptions): CareDaySlot[] {
  return generateCareDaySlots(
    dateIso,
    options.bookingWindowStartHour,
    options.bookingWindowEndHour,
    options.minBookingHours,
  );
}

function isDayBookable(dateIso: string, options: BookingOptions): boolean {
  return careDaySlots(dateIso, options).some((slot) => isStartBookable(slot.startWall, options));
}

export default function BookingDatePickerScreen() {
  const router = useRouter();
  const { data: options, isLoading, error } = useBookingOptions();
  // Loaded a screen early so the mother sees the price while she chooses, not
  // after. Step 2 runs the identical calculation, so the two can't disagree.
  const { data: pricing } = usePricingConfig();

  const today = useMemo(() => new Date(), []);
  const todayIso = toDateIso(today.getFullYear(), today.getMonth(), today.getDate());

  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [showGrid, setShowGrid] = useState(false);
  const [selectedDateIso, setSelectedDateIso] = useState<string | null>(null);
  /**
   * The chosen start, at full minute precision. Held as a wall-clock string
   * rather than an hour index so an exact time like 08:37 is a first-class
   * value, not a special case bolted onto an hourly grid.
   */
  const [startWall, setStartWall] = useState<string | null>(null);
  const [selectedDurationMinutes, setSelectedDurationMinutes] = useState<number | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);

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

  /**
   * The rail starts YESTERDAY, not today: with a window that runs past midnight,
   * yesterday's care day still owns after-midnight slots that are in the future.
   * Unbookable entries are dropped, so a stale yesterday simply never appears.
   */
  const railDays = useMemo(() => {
    const days: RailDay[] = [];
    if (!options) return days;
    for (let offset = -1; offset < RAIL_DAYS; offset++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
      const dateIso = toDateIso(d.getFullYear(), d.getMonth(), d.getDate());
      if (!isDayBookable(dateIso, options)) continue;
      days.push({
        dateIso,
        year: d.getFullYear(),
        month: d.getMonth(),
        day: d.getDate(),
        weekday: WEEKDAYS[d.getDay()] ?? '',
        relative: offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : null,
      });
    }
    return days;
  }, [options, today]);

  /**
   * Which days in the displayed month have at least one slot left — the grid's
   * equivalent of the rail's filter.
   */
  const bookableDays = useMemo(() => {
    const days = new Set<number>();
    if (!options) return days;
    for (let day = 1; day <= daysInMonth; day++) {
      if (isDayBookable(toDateIso(currentYear, currentMonth, day), options)) days.add(day);
    }
    return days;
  }, [options, currentYear, currentMonth, daysInMonth]);

  /**
   * The hours care may start on this day. Built from the real slot list rather
   * than 0–23, so it already carries the right calendar date for a window that
   * runs past midnight, and never offers an hour too late for the shortest
   * booking.
   */
  const hourSlots = useMemo(() => {
    if (!options || !selectedDateIso) return [];
    return careDaySlots(selectedDateIso, options);
  }, [options, selectedDateIso]);

  /**
   * Every start time on offer, at minute granularity. The chips jump between
   * hours and the stepper walks this list one notch at a time, so coarse and
   * fine selection share a single underlying value.
   *
   * Candidates are filtered with the same function the server validates with,
   * so the picker can't offer a start the API would reject.
   */
  const startCandidates = useMemo(() => {
    if (!options) return [];
    const out: string[] = [];
    for (const slot of hourSlots) {
      for (let minute = 0; minute < 60; minute += START_STEP_MINUTES) {
        const candidate = withTimeOfDay(slot.startWall, slot.hour, minute);
        if (!isStartBookable(candidate, options)) continue;
        if (
          !isBookingWithinDailyWindow(
            candidate,
            addMinutesToWall(candidate, options.minBookingHours * 60),
            options.bookingWindowStartHour,
            options.bookingWindowEndHour,
          )
        ) {
          continue;
        }
        out.push(candidate);
      }
    }
    return out;
  }, [hourSlots, options]);

  const startIndex = useMemo(
    () => (startWall ? startCandidates.indexOf(startWall) : -1),
    [startCandidates, startWall],
  );

  /** One chip per bookable hour — the coarse jump, mirroring the duration chips. */
  const hourChips = useMemo(
    () =>
      hourSlots
        .map((slot) => ({
          hour: slot.hour,
          label: formatHour24(slot.hour),
          // The first candidate inside this hour, or null when none of its
          // minutes clear the lead time.
          start: startCandidates.find((c) => c.slice(0, 13) === slot.startWall.slice(0, 13)) ?? null,
        }))
        .filter((chip) => chip.start !== null),
    [hourSlots, startCandidates],
  );

  /** Every whole-hour length the configured limits allow, before the start narrows it. */
  const durationChoices = useMemo(() => {
    if (!options) return [];
    const longest = Math.min(options.maxBookingHours, windowLength);
    const list: number[] = [];
    for (let m = options.minBookingHours * 60; m <= longest * 60; m += DURATION_STEP_MINUTES) {
      list.push(m);
    }
    return list;
  }, [options, windowLength]);

  /**
   * Of those, the ones that still end before the window closes from this start.
   * Filtered with the very function the server validates against, so the picker
   * can't offer a booking the API would reject.
   */
  const availableDurations = useMemo(() => {
    if (!options || !startWall) return durationChoices;
    return durationChoices.filter((minutes) =>
      isBookingWithinDailyWindow(
        startWall,
        addMinutesToWall(startWall, minutes),
        options.bookingWindowStartHour,
        options.bookingWindowEndHour,
      ),
    );
  }, [durationChoices, options, startWall]);

  /**
   * Falls back when the chosen length no longer fits — picking a late start with
   * "8 hours" already selected would otherwise just disable Continue with no
   * explanation. Prefers 4 hours, as the old picker defaulted to.
   */
  const durationMinutes = useMemo(() => {
    if (selectedDurationMinutes !== null && availableDurations.includes(selectedDurationMinutes)) {
      return selectedDurationMinutes;
    }
    return availableDurations.find((m) => m === 240) ?? availableDurations[0] ?? null;
  }, [selectedDurationMinutes, availableDurations]);

  const minDuration = availableDurations[0] ?? 0;
  const maxDuration = availableDurations[availableDurations.length - 1] ?? 0;
  /** The start is late enough that longer bookings no longer fit the window. */
  const durationCapped =
    durationChoices.length > 0 && availableDurations.length < durationChoices.length;

  const endWall =
    startWall && durationMinutes !== null ? addMinutesToWall(startWall, durationMinutes) : null;

  const breakdown = useMemo(() => {
    if (!pricing || durationMinutes === null || durationMinutes <= 0) return null;
    const hours = durationMinutes / 60;
    return calculatePriceBreakdown({
      baseRate: pricing.standardHourlyRate,
      durationHours: hours,
      skillAddOns: [],
      durationMultiplier: resolveDurationMultiplier(hours, pricing.durationRules),
      discountAmount: 0,
      nannyPercent: pricing.nannyPercent,
      platformPercent: pricing.platformPercent,
    });
  }, [pricing, durationMinutes]);

  /**
   * The cheapest longer tier still reachable from this start — "add 2h and the
   * whole booking drops 10%". Read straight off the configured rules, so it
   * disappears on its own when an admin removes them.
   */
  const nextDurationDeal = useMemo(() => {
    if (!pricing || durationMinutes === null) return null;
    const currentHours = durationMinutes / 60;
    const current = resolveDurationMultiplier(currentHours, pricing.durationRules);
    const candidate = pricing.durationRules
      .filter(
        (r) =>
          r.minHours > currentHours && r.minHours * 60 <= maxDuration && r.multiplier < current,
      )
      .sort((a, b) => a.minHours - b.minHours)[0];
    if (!candidate) return null;
    const percentOff = Math.round((1 - candidate.multiplier) * 100);
    if (percentOff <= 0) return null;
    return {
      minHours: candidate.minHours,
      addMinutes: candidate.minHours * 60 - durationMinutes,
      percentOff,
    };
  }, [pricing, durationMinutes, maxDuration]);

  const selectDate = (dateIso: string, year: number, month: number) => {
    setSelectedDateIso(dateIso);
    setTimeError(null);
    // Land on the first bookable start straight away. The wheel always shows
    // the value under its centre band, so leaving it unselected would display
    // a time that isn't actually chosen — and would leave the minute column
    // with no hour to validate against.
    const firstStart = options
      ? careDaySlots(dateIso, options).find((slot) => isStartBookable(slot.startWall, options))
      : undefined;
    setStartWall(firstStart?.startWall ?? null);
    // Keep the grid pointed at whatever the rail just picked, so toggling
    // between the two views never jumps to an unrelated month.
    setCurrentYear(year);
    setCurrentMonth(month);
  };

  const changeMonth = (delta: number) => {
    const next = currentMonth + delta;
    setCurrentMonth(((next % 12) + 12) % 12);
    if (next < 0) setCurrentYear((y) => y - 1);
    if (next > 11) setCurrentYear((y) => y + 1);
    setSelectedDateIso(null);
    setStartWall(null);
    setTimeError(null);
  };

  /**
   * Commits an exact start, rejecting it with a reason rather than silently
   * clamping — a mother who picked 9:50pm deserves to know why it won't fit.
   */
  const applyStart = (nextStart: string) => {
    if (!options) return;
    if (!isStartBookable(nextStart, options)) {
      setTimeError(
        `That's inside the ${options.minAdvanceBookingHours}-hour notice period. Pick a later time.`,
      );
      return;
    }
    const fits = isBookingWithinDailyWindow(
      nextStart,
      addMinutesToWall(nextStart, options.minBookingHours * 60),
      options.bookingWindowStartHour,
      options.bookingWindowEndHour,
    );
    if (!fits) {
      setTimeError(
        `A ${options.minBookingHours}-hour booking from then would run past ${formatHour24(
          options.bookingWindowEndHour,
        )}.`,
      );
      return;
    }
    setTimeError(null);
    setStartWall(nextStart);
  };

  const canContinue =
    !!options && !!startWall && !!endWall && durationMinutes !== null && durationMinutes > 0;

  const handleContinue = () => {
    if (!canContinue || !startWall || !endWall || durationMinutes === null) return;

    router.push({
      pathname: '/(parent)/book/booking-care-details',
      params: {
        // The date the booking actually STARTS — which for a late-night slot is
        // the day after the one tapped. The server derives its own from the
        // start time; this is only for display.
        dateIso: startWall.slice(0, 10),
        startTimeWall: startWall,
        endTimeWall: endWall,
        durationHours: String(durationMinutes / 60),
      },
    } as never);
  };

  const renderDateRail = () => {
    if (railDays.length === 0) {
      return <Text style={styles.slotsPlaceholder}>No dates are available right now.</Text>;
    }
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railContent}
      >
        {railDays.map((d) => {
          const selected = selectedDateIso === d.dateIso;
          return (
            <Pressable
              key={d.dateIso}
              style={[styles.railCard, selected && styles.railCardSelected]}
              onPress={() => selectDate(d.dateIso, d.year, d.month)}
            >
              <Text style={[styles.railWeekday, selected && styles.railTextSelected]}>
                {d.relative ?? d.weekday}
              </Text>
              <Text style={[styles.railDay, selected && styles.railTextSelected]}>{d.day}</Text>
              <Text style={[styles.railMonth, selected && styles.railTextSelected]}>
                {MONTHS[d.month]?.slice(0, 3)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  };

  const renderMonthGrid = () => (
    <View style={styles.gridBlock}>
      <View style={styles.calendarHeader}>
        <Pressable style={styles.calendarNavButton} onPress={() => changeMonth(-1)}>
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.calendarMonth}>
          {MONTHS[currentMonth]} {currentYear}
        </Text>
        <Pressable style={styles.calendarNavButton} onPress={() => changeMonth(1)}>
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
          const dateIso = toDateIso(currentYear, currentMonth, day);
          const unavailable = !bookableDays.has(day);
          const selected = selectedDateIso === dateIso;
          const todayMark = dateIso === todayIso;
          return (
            <Pressable
              key={day}
              style={styles.dayCell}
              onPress={() => {
                if (unavailable) return;
                selectDate(dateIso, currentYear, currentMonth);
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
  );

  /**
   * Start time, built from the same parts as the duration card below it: a big
   * readout, a stepper for fine adjustment, and chips for the coarse jump. An
   * earlier version used a scroll wheel, which read as a transplanted system
   * control against the app's warm cards and pills.
   */
  const renderStartTime = () => {
    if (selectedDateIso === null) {
      return <Text style={styles.slotsPlaceholder}>Pick a day to see available times</Text>;
    }
    if (startCandidates.length === 0) {
      return <Text style={styles.slotsPlaceholder}>No times are available on this date.</Text>;
    }
    return (
      <View style={styles.durationCard}>
        <View style={styles.durationTopRow}>
          <View style={styles.durationReadout}>
            <Text style={styles.durationValue}>
              {startWall ? formatBookingTime(startWall) : '—'}
            </Text>
            <Text style={styles.durationCaption}>
              {timeError ?? `Adjust in ${START_STEP_MINUTES}-minute steps`}
            </Text>
          </View>
          <Stepper
            value={Math.max(startIndex, 0)}
            onChange={(index) => {
              const next = startCandidates[index];
              if (next) applyStart(next);
            }}
            min={0}
            max={startCandidates.length - 1}
            // Only the minutes: repeating the full time next to the readout
            // that already shows it made the control wide and redundant.
            formatValue={(index) => {
              const at = startCandidates[index];
              return at ? `:${at.slice(14, 16)}` : '—';
            }}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickScrollRow}
        >
          {hourChips.map((chip) => {
            const isSelected = startWall?.slice(11, 13) === pad2(chip.hour);
            return (
              <Pressable
                key={chip.hour}
                style={[styles.durationChip, isSelected && styles.durationChipSelected]}
                onPress={() => chip.start && applyStart(chip.start)}
              >
                <Text
                  style={[
                    styles.durationChipText,
                    isSelected && styles.durationChipTextSelected,
                  ]}
                >
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const summaryLine =
    startWall && endWall
      ? [
          fmtBookingDate(startWall.slice(0, 10)),
          `${formatBookingTime(startWall)} - ${formatBookingTime(endWall)}`,
          durationMinutes !== null ? formatMinutes(durationMinutes) : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : undefined;

  const ctaLabel = !selectedDateIso
    ? 'Select a day'
    : !startWall
      ? 'Select a start time'
      : breakdown
        ? `Continue · ${formatMoney(breakdown.totalAmount)}`
        : 'Continue';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <BookingStepProgress step={1} title="When do you need care?" />

        {isLoading && <ActivityIndicator color={colors.primary} />}
        {error != null && (
          <Text style={styles.availabilityError}>
            Couldn’t load available times. Pull back and try again.
          </Text>
        )}

        {options && (
          <>
            <View style={styles.noticePill}>
              <Ionicons name="information-circle-outline" size={15} color={colors.textTertiary} />
              <Text style={styles.advanceNotice}>
                {options.minAdvanceBookingHours > 0
                  ? `Book ${options.minAdvanceBookingHours}${
                      options.minAdvanceBookingHours === 1 ? 'h' : 'h'
                    }+ ahead · care runs ${formatHour24(
                      options.bookingWindowStartHour,
                    )}–${formatHour24(options.bookingWindowEndHour)}`
                  : `Care runs ${formatHour24(options.bookingWindowStartHour)}–${formatHour24(
                      options.bookingWindowEndHour,
                    )}`}
              </Text>
            </View>

            {/* Day */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Pick a day</Text>
                <Pressable
                  style={styles.viewToggle}
                  onPress={() => setShowGrid((prev) => !prev)}
                  hitSlop={8}
                >
                  <Ionicons
                    name={showGrid ? 'reorder-four-outline' : 'calendar-outline'}
                    size={15}
                    color={colors.primaryDark}
                  />
                  <Text style={styles.viewToggleText}>
                    {showGrid ? 'Next 30 days' : 'Full calendar'}
                  </Text>
                </Pressable>
              </View>
              {showGrid ? renderMonthGrid() : renderDateRail()}
            </View>

            {/* Time */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Start time</Text>
              {renderStartTime()}
            </View>

            {/* Duration */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>How long?</Text>

              <View style={styles.durationCard}>
                <View style={styles.durationTopRow}>
                  <View style={styles.durationReadout}>
                    <Text style={styles.durationValue}>
                      {durationMinutes !== null ? formatMinutes(durationMinutes) : '—'}
                    </Text>
                    <Text style={styles.durationCaption}>
                      {startWall && endWall
                        ? `${formatBookingTime(startWall)} – ${formatBookingTime(endWall)}`
                        : 'Pick a start time first'}
                    </Text>
                  </View>
                  <Stepper
                    value={durationMinutes ?? minDuration}
                    onChange={setSelectedDurationMinutes}
                    min={minDuration}
                    max={maxDuration}
                    step={DURATION_STEP_MINUTES}
                    formatValue={formatMinutes}
                    disabled={availableDurations.length === 0}
                  />
                </View>

                <View style={styles.quickRow}>
                  {QUICK_DURATION_HOURS.map((hrs) => hrs * 60)
                    .filter((m) => durationChoices.includes(m))
                    .map((minutes) => {
                      const isSelected = durationMinutes === minutes;
                      // Shown but greyed out, so it stays visible that a longer
                      // booking exists and is simply too late in the day for it.
                      const disabled = !availableDurations.includes(minutes);
                      return (
                        <Pressable
                          key={minutes}
                          style={[
                            styles.durationChip,
                            isSelected && styles.durationChipSelected,
                            disabled && styles.durationChipDisabled,
                          ]}
                          onPress={() => {
                            if (!disabled) setSelectedDurationMinutes(minutes);
                          }}
                          disabled={disabled}
                        >
                          <Text
                            style={[
                              styles.durationChipText,
                              isSelected && styles.durationChipTextSelected,
                            ]}
                          >
                            {formatMinutes(minutes)}
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>

                {durationCapped && startWall && (
                  <Text style={styles.durationHint}>
                    This start allows up to {formatMinutes(maxDuration)}. Start earlier for a
                    longer booking.
                  </Text>
                )}
              </View>
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

      <BookingSummaryBar
        summary={summaryLine}
        placeholder="Choose a day and time"
        total={breakdown ? formatMoney(breakdown.totalAmount) : null}
        ctaLabel={ctaLabel}
        onPress={handleContinue}
        disabled={!canContinue}
      >
        {nextDurationDeal && (
          <View style={styles.dealBanner}>
            <Ionicons name="pricetag-outline" size={15} color={colors.successDark} />
            <Text style={styles.dealText}>
              Add {formatMinutes(nextDurationDeal.addMinutes)} ({nextDurationDeal.minHours}h
              total) and save {nextDurationDeal.percentOff}% on the whole booking
            </Text>
          </View>
        )}
      </BookingSummaryBar>
    </View>
  );
}
