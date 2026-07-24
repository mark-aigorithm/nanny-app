import React, { useEffect, useMemo, useState } from 'react';
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
  formatChildAge,
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
 * Chip label: the name, plus what it adds to THIS booking. Free skills
 * carry no suffix — "+EGP 0.00" on half the list was pure noise.
 */
function addOnChipLabel(skill: PublicSkill, baseRate: number | null, hours: number): string {
  if (baseRate == null || hours <= 0) return skill.name;
  const amount = addOnAmount(skill, baseRate, hours);
  if (amount <= 0.005) return skill.name;
  return `${skill.name} · +${formatMoney(amount, { fractionDigits: 0 })}`;
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
  const [children, setChildren] = useState<DraftChild[]>(() => {
    const fromParams = parseChildrenParam(params.children);
    return fromParams.length > 0
      ? fromParams.map((c) => ({ name: c.name ?? '', ageYears: c.ageYears }))
      : [];
  });
  const [selectedSkillIds, setSelectedSkillIds] = useState<number[]>(() =>
    parseSkillIdsParam(params.skillIds),
  );
  const [saveChildren, setSaveChildren] = useState(params.saveChildren === '1');

  // Prefill from her saved family on first arrival. Guarded on `children` being
  // empty so this can never clobber a selection she has already made — including
  // the one restored from params above, which resolves before this runs.
  useEffect(() => {
    if (!savedLoaded || children.length > 0) return;
    const seed =
      savedChildren && savedChildren.length > 0
        ? savedChildren.map((c) => ({ name: c.name ?? '', ageYears: c.ageYears }))
        : [{ name: '', ageYears: DEFAULT_CHILD_AGE }];
    setChildren(seed.slice(0, Math.max(1, maxChildren)));
  }, [savedLoaded, savedChildren, children.length, maxChildren]);

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

  const setCount = (next: number) => {
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
            trackColor={{ false: colors.neutralLight, true: colors.primary }}
            thumbColor={colors.white}
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
                  label={addOnChipLabel(skill, hourlyRate, hours)}
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
        total={effectiveRate ? `${formatMoney(effectiveRate.rate, { fractionDigits: 0 })}/hr` : null}
        totalLabel="Hourly rate"
        ctaLabel="Continue to review"
        onPress={handleContinue}
        disabled={children.length === 0}
      />
    </View>
  );
}
