import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

import {
  calculatePriceBreakdown,
  formatChildAge,
  resolveDurationMultiplier,
  resolveEffectiveRate,
  resolveExtraChildFee,
  type BookingChild,
  type PublicSkill,
} from '@nanny-app/shared';

import { colors } from '@mobile/theme';
import { Chip, Stepper } from '@mobile/components/ui';
import { APP_NAME } from '@mobile/constants';
import { usePricingConfig } from '@mobile/hooks/useBookings';
import { useSavedChildren } from '@mobile/hooks/useChildren';
import { formatMoney } from '@mobile/lib/formatMoney';
import { formatDurationHours } from '@mobile/lib/formatTime';
import {
  getBookingDateDisplay,
  getBookingDurationHours,
  getBookingTimeDisplay,
  hasRequiredBookingDraft,
  parseChildrenParam,
  parseSkillIdsParam,
  type BookingFlowParams,
} from '@mobile/lib/bookingDraft';

import BookingStepProgress from '@mobile/components/BookingStepProgress';
import BookingSummaryBar from '@mobile/components/BookingSummaryBar';
import { styles } from './styles/booking-care-details-screen.styles';

/** Matches ChildAgeYearsSchema — past this a nanny isn't who you'd book. */
const MAX_CHILD_AGE = 17;

/**
 * Age a newly-added child starts at. A visible, editable default beats an empty
 * state she has to clear before the form will move: the number is right there on
 * the stepper, so nothing is submitted that she hasn't seen.
 */
const DEFAULT_CHILD_AGE = 3;

type DraftChild = { name: string; ageYears: number };

/** What a skill add-on costs across the whole booking, in money. */
function addOnAmount(skill: PublicSkill, baseRate: number, hours: number): number {
  if (skill.feeType === 'FLAT') return skill.feeValue * hours;
  if (skill.feeType === 'PERCENTAGE') return baseRate * (skill.feeValue / 100) * hours;
  return 0;
}

/**
 * Chip label: the name, plus what the skill adds to the HOURLY rate — a per-hour
 * figure, matching the "Your hourly rate" card below, so the numbers on this
 * screen all speak the same unit. Free skills carry no suffix — "+EGP 0.00" on
 * half the list was pure noise.
 */
function addOnChipLabel(skill: PublicSkill, baseRate: number | null): string {
  if (baseRate == null) return skill.name;
  // `addOnAmount` for a single hour is exactly the per-hour add-on.
  const perHour = addOnAmount(skill, baseRate, 1);
  if (perHour <= 0.005) return skill.name;
  return `${skill.name} · +${formatMoney(perHour, { fractionDigits: 0 })}/hr`;
}

/**
 * Step 2 of the booking flow: who the nanny is caring for, and any skills she
 * needs. Both live here rather than on the review step because both change the
 * price — by the time a mother reaches "Review your request" the number should
 * already be settled, not still being assembled.
 */
export default function BookingCareDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<BookingFlowParams>();

  const draftReady = hasRequiredBookingDraft(params);
  const { data: pricing } = usePricingConfig();
  const { data: savedChildren, isSuccess: savedLoaded } = useSavedChildren();

  const hours = getBookingDurationHours(params);
  const hourlyRate = pricing?.standardHourlyRate ?? null;
  const maxChildren = pricing?.maxChildrenPerBooking ?? 1;
  const includedChildren = pricing?.includedChildrenPerBooking ?? 1;

  // Coming back from the review step must restore exactly what she chose, so the
  // params win over her saved family whenever they carry anything.
  const cameWithChildren = useMemo(
    () => parseChildrenParam(params.children).length > 0,
    [params.children],
  );
  const [children, setChildren] = useState<DraftChild[]>(() => {
    const fromParams = parseChildrenParam(params.children);
    // Never start empty. The stepper floors at one child and the CTA needs a
    // count to enable; waiting on the saved-children query to seed left the
    // screen stuck at "0 children" whenever that request was slow or errored.
    return fromParams.length > 0
      ? fromParams.map((c) => ({ name: c.name ?? '', ageYears: c.ageYears }))
      : [{ name: '', ageYears: DEFAULT_CHILD_AGE }];
  });
  const [selectedSkillIds, setSelectedSkillIds] = useState<number[]>(() =>
    parseSkillIdsParam(params.skillIds),
  );
  // On by default so her family carries to the next booking without a tap. The
  // param is only ever '0' once she has explicitly turned it off and moved on,
  // so returning from the review step still respects that choice.
  const [saveChildren, setSaveChildren] = useState(params.saveChildren !== '0');

  // The default child above is a placeholder her saved family should replace —
  // but only on first arrival, and never over a real selection (restored params,
  // or a count she has since changed). This latch tracks "the draft is now hers".
  const childrenSettled = useRef(cameWithChildren);

  // Prefill from her saved family once, on first arrival. Guarded by the latch so
  // it can swap the placeholder for her real family but never clobber a choice
  // she has already made.
  useEffect(() => {
    if (childrenSettled.current || !savedLoaded) return;
    childrenSettled.current = true;
    if (savedChildren && savedChildren.length > 0) {
      setChildren(
        savedChildren
          .slice(0, Math.max(1, maxChildren))
          .map((c) => ({ name: c.name ?? '', ageYears: c.ageYears })),
      );
    }
  }, [savedLoaded, savedChildren, maxChildren]);

  const extraChildren = Math.max(0, children.length - includedChildren);

  const addOns = pricing?.skillAddOns ?? [];
  const selectedAddOns = addOns.filter((s) => selectedSkillIds.includes(s.id));

  // The same engine the server runs, so the rate shown here is the rate charged.
  const effectiveRate = useMemo(() => {
    if (!pricing) return null;
    const { effectiveHourlyRate } = resolveEffectiveRate(
      pricing.standardHourlyRate,
      selectedAddOns,
    );
    const { amountPerHour } = resolveExtraChildFee(pricing.standardHourlyRate, {
      childrenCount: children.length,
      includedChildren: pricing.includedChildrenPerBooking,
      feeType: pricing.extraChildFeeType,
      feeValue: pricing.extraChildFeeValue,
    });
    return { rate: effectiveHourlyRate + amountPerHour, childFeePerHour: amountPerHour };
  }, [pricing, selectedAddOns, children.length]);

  // The whole-booking total — base + skills + extra children across the
  // duration, with the longer-booking discount applied. Runs the same engine as
  // the review step and the server, so the footer's number is what she'll pay.
  const bookingTotal = useMemo(() => {
    if (!pricing || hours <= 0) return null;
    return calculatePriceBreakdown({
      baseRate: pricing.standardHourlyRate,
      durationHours: hours,
      skillAddOns: selectedAddOns,
      extraChildFee: {
        childrenCount: children.length,
        includedChildren: pricing.includedChildrenPerBooking,
        feeType: pricing.extraChildFeeType,
        feeValue: pricing.extraChildFeeValue,
      },
      durationMultiplier: resolveDurationMultiplier(hours, pricing.durationRules),
      discountAmount: 0,
      nannyPercent: pricing.nannyPercent,
      platformPercent: pricing.platformPercent,
    }).totalAmount;
  }, [pricing, hours, selectedAddOns, children.length]);

  const setCount = (next: number) => {
    childrenSettled.current = true;
    setChildren((prev) => {
      if (next === prev.length) return prev;
      if (next < prev.length) return prev.slice(0, next);
      const added = Array.from({ length: next - prev.length }, () => ({
        name: '',
        ageYears: DEFAULT_CHILD_AGE,
      }));
      return [...prev, ...added];
    });
  };

  const patchChild = (index: number, patch: Partial<DraftChild>) => {
    childrenSettled.current = true;
    setChildren((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const toggleSkill = (id: number) => {
    setSelectedSkillIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  const handleContinue = () => {
    if (children.length === 0) return;
    const payload: BookingChild[] = children.map((c) => ({
      name: c.name.trim() ? c.name.trim() : null,
      ageYears: c.ageYears,
    }));
    router.push({
      pathname: '/(parent)/book/booking-step-1',
      params: {
        ...params,
        children: JSON.stringify(payload),
        skillIds: selectedSkillIds.join(','),
        saveChildren: saveChildren ? '1' : '0',
      },
    } as never);
  };

  const summaryLine = useMemo(
    () =>
      [
        getBookingDateDisplay(params),
        getBookingTimeDisplay(params),
        hours > 0 ? formatDurationHours(hours) : null,
      ]
        .filter(Boolean)
        .join(' · '),
    [params, hours],
  );

  if (!draftReady) {
    return (
      <View style={[styles.container, styles.centeredState]}>
        <Text style={styles.missingParamsText}>Select a date and time to continue.</Text>
        <TouchableOpacity style={styles.missingParamsBtn} onPress={() => router.back()}>
          <Text style={styles.missingParamsBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{APP_NAME}</Text>
          <View style={styles.headerIconBtn} />
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <BookingStepProgress step={2} title="Who needs care?" />

        {/* ── How many ── */}
        <View style={styles.countRow}>
          <View style={styles.countBody}>
            <Text style={styles.countTitle}>Children</Text>
            <Text style={styles.countSub}>
              {includedChildren} included in the rate
              {extraChildren > 0 && effectiveRate
                ? ` · +${formatMoney(effectiveRate.childFeePerHour, { fractionDigits: 0 })}/hr for ${extraChildren} more`
                : ''}
            </Text>
          </View>
          <Stepper
            value={children.length}
            onChange={setCount}
            min={1}
            max={Math.max(1, maxChildren)}
            size="sm"
          />
        </View>

        {/* ── Each child ──
            Name is optional, age is not: the age is what the nanny judges the
            job on and what the request card shows her. */}
        {children.map((child, index) => {
          const isExtra = index >= includedChildren;
          return (
            <View key={index} style={styles.childCard}>
              <View style={styles.childHeaderRow}>
                <View style={styles.childIndex}>
                  <Text style={styles.childIndexText}>{index + 1}</Text>
                </View>
                <TextInput
                  style={styles.childNameInput}
                  value={child.name}
                  onChangeText={(name) => patchChild(index, { name })}
                  placeholder="Name (optional)"
                  placeholderTextColor={colors.textPlaceholder}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
                {isExtra && effectiveRate && effectiveRate.childFeePerHour > 0 && (
                  <View style={styles.childBadge}>
                    <Text style={styles.childBadgeText}>Extra</Text>
                  </View>
                )}
              </View>

              {/* A stepper, not a list of every year: eighteen chips per child
                  was three screens of scrolling before the second child, and the
                  mother knows the age — she doesn't need to hunt for it. */}
              <View style={styles.ageRow}>
                <Text style={styles.ageLabel}>Age</Text>
                <Stepper
                  value={child.ageYears}
                  onChange={(ageYears) => patchChild(index, { ageYears })}
                  min={0}
                  max={MAX_CHILD_AGE}
                  formatValue={formatChildAge}
                  size="sm"
                />
              </View>
            </View>
          );
        })}

        {/* ── Save for next time ── */}
        <View style={styles.saveRow}>
          <View style={styles.saveBody}>
            <Text style={styles.saveTitle}>Save for next booking</Text>
            <Text style={styles.saveSub}>
              We&apos;ll fill this in for you next time. You can still change it.
            </Text>
          </View>
          <Switch
            value={saveChildren}
            onValueChange={setSaveChildren}
            trackColor={{ false: colors.taupe, true: colors.primary }}
            thumbColor={colors.white}
            // Without this the off-state track has no fill on iOS, so a white
            // thumb over a white card left the toggle invisible.
            ios_backgroundColor={colors.taupe}
          />
        </View>

        {/* ── Skills ── */}
        {addOns.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Need a specific skill?</Text>
            <Text style={styles.sectionHint}>
              Optional — the fee is added to the hourly rate for this booking.
            </Text>
            <View style={styles.tagRow}>
              {addOns.map((skill) => (
                <Chip
                  key={skill.id}
                  label={addOnChipLabel(skill, hourlyRate)}
                  active={selectedSkillIds.includes(skill.id)}
                  onPress={() => toggleSkill(skill.id)}
                  size="sm"
                  inactiveColor={colors.taupeLight}
                />
              ))}
            </View>
          </View>
        )}

        {/* ── Live rate ──
            The running hourly rate, so the effect of a skill or an extra
            child is visible here rather than as a surprise on the next screen. */}
        {effectiveRate && hourlyRate != null && (
          <View style={styles.rateCard}>
            <View style={styles.rateBody}>
              <Text style={styles.rateTitle}>Your hourly rate</Text>
              <Text style={styles.rateLine}>
                {formatMoney(hourlyRate, { fractionDigits: 0 })} base
                {selectedAddOns.length > 0
                  ? ` · ${selectedAddOns.length} skill${selectedAddOns.length === 1 ? '' : 's'}`
                  : ''}
                {effectiveRate.childFeePerHour > 0
                  ? ` · +${formatMoney(effectiveRate.childFeePerHour, { fractionDigits: 0 })} children`
                  : ''}
              </Text>
            </View>
            <Text style={styles.rateValue}>
              {formatMoney(effectiveRate.rate, { fractionDigits: 0 })}/hr
            </Text>
          </View>
        )}
      </ScrollView>

      <BookingSummaryBar
        summary={summaryLine}
        total={bookingTotal != null ? formatMoney(bookingTotal) : null}
        totalLabel="Estimated total"
        ctaLabel="Continue to review"
        onPress={handleContinue}
        disabled={children.length === 0}
      />
    </View>
  );
}
