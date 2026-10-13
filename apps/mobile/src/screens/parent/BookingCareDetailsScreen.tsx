import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, TouchableOpacity, Pressable, ActivityIndicator } from 'react-native';
import { Text } from '@mobile/components/ui/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

import {
  calculatePriceBreakdown,
  childMissingForBooking,
  formatChildAge,
  formatHealthLine,
  resolveDurationMultiplier,
  resolveEffectiveRate,
  resolveExtraChildFee,
  toBookingChild,
  type Child,
  type ChildInput,
  type PublicSkill,
} from '@nanny-app/shared';

import { colors } from '@mobile/theme';
import { Button, Chip } from '@mobile/components/ui';
import { APP_NAME } from '@mobile/constants';
import { usePricingConfig } from '@mobile/hooks/useBookings';
import { useChildren, useCreateChild, useUpdateChild } from '@mobile/hooks/useChildren';
import { getApiErrorMessage } from '@mobile/lib/api';
import { formatMoney } from '@mobile/lib/formatMoney';
import { formatDurationHours } from '@mobile/lib/formatTime';
import {
  getBookingDateDisplay,
  getBookingDurationHours,
  getBookingTimeDisplay,
  hasRequiredBookingDraft,
  parseChildIdsParam,
  parseSkillIdsParam,
  type BookingFlowParams,
} from '@mobile/lib/bookingDraft';

import BookingStepProgress from '@mobile/components/BookingStepProgress';
import BookingSummaryBar from '@mobile/components/BookingSummaryBar';
import ChildFormSheet from '@mobile/components/ChildFormSheet';
import { styles } from './styles/booking-care-details-screen.styles';

/** What the child sheet is open for: adding, or editing one saved child. */
type SheetState = { mode: 'closed' } | { mode: 'add' } | { mode: 'edit'; child: Child };

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
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<BookingFlowParams>();

  const draftReady = hasRequiredBookingDraft(params);
  const { data: pricing } = usePricingConfig();
  const {
    data: savedChildren,
    isLoading: childrenLoading,
    isError: childrenError,
    refetch: refetchChildren,
  } = useChildren();
  const createChild = useCreateChild();
  const updateChild = useUpdateChild();

  const hours = getBookingDurationHours(params);
  const hourlyRate = pricing?.standardHourlyRate ?? null;
  const maxChildren = pricing?.maxChildrenPerBooking ?? 1;
  const includedChildren = pricing?.includedChildrenPerBooking ?? 1;
  // Ages are worked out on the booking's month, as the server will.
  const bookingMonth = (params.startTimeWall ?? params.dateIso ?? '').slice(0, 7);

  // Ids of the saved children she has ticked, in the order she ticked them —
  // which is also the order the extra-child badge counts in. Coming back from
  // the review step restores exactly what she chose.
  const [selectedIds, setSelectedIds] = useState<number[]>(() =>
    parseChildIdsParam(params.childIds),
  );
  const [selectedSkillIds, setSelectedSkillIds] = useState<number[]>(() =>
    parseSkillIdsParam(params.skillIds),
  );
  const [sheet, setSheet] = useState<SheetState>({ mode: 'closed' });
  const [sheetError, setSheetError] = useState<string | null>(null);

  // A mother with one child doesn't need to tick her: on first arrival, with
  // nothing chosen yet, an only (bookable) child is picked for her. With two or
  // more, who comes is a real choice, so nothing is assumed.
  const preselected = useRef(selectedIds.length > 0);
  useEffect(() => {
    if (preselected.current || !savedChildren) return;
    preselected.current = true;
    const only = savedChildren.length === 1 ? savedChildren[0] : undefined;
    if (only && !childMissingForBooking(only)) setSelectedIds([only.id]);
  }, [savedChildren]);

  // Drop a selection whose child has since been removed (e.g. from another tab).
  const children = useMemo(() => {
    const byId = new Map((savedChildren ?? []).map((c) => [c.id, c]));
    return selectedIds.flatMap((id) => {
      const child = byId.get(id);
      return child ? [child] : [];
    });
  }, [savedChildren, selectedIds]);
  const atMax = children.length >= maxChildren;

  const toggleChild = (child: Child) => {
    if (childMissingForBooking(child)) {
      // An older build's child with no name or birth month: finish them first.
      openEdit(child);
      return;
    }
    setSelectedIds((prev) => {
      if (prev.includes(child.id)) return prev.filter((id) => id !== child.id);
      if (prev.length >= maxChildren) return prev;
      return [...prev, child.id];
    });
  };

  const openAdd = () => {
    setSheetError(null);
    setSheet({ mode: 'add' });
  };
  const openEdit = (child: Child) => {
    setSheetError(null);
    setSheet({ mode: 'edit', child });
  };
  const closeSheet = () => setSheet({ mode: 'closed' });

  const handleSaveChild = (input: ChildInput) => {
    setSheetError(null);
    const onError = (err: unknown) =>
      setSheetError(getApiErrorMessage(err, 'Could not save. Please try again.'));
    // Saved to her profile either way, then ticked — she opened the sheet from
    // here to book this child.
    const select = (saved: Child) => {
      setSelectedIds((prev) =>
        prev.includes(saved.id) || prev.length >= maxChildren ? prev : [...prev, saved.id],
      );
      closeSheet();
    };
    if (sheet.mode === 'edit') {
      updateChild.mutate({ id: sheet.child.id, input }, { onSuccess: select, onError });
    } else {
      createChild.mutate(input, { onSuccess: select, onError });
    }
  };

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

  const toggleSkill = (id: number) => {
    setSelectedSkillIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  const handleContinue = () => {
    if (children.length === 0) return;
    router.push({
      pathname: '/(parent)/book/booking-step-1',
      params: {
        ...params,
        childIds: children.map((c) => c.id).join(','),
        // The snapshot the review step shows; the server builds its own from
        // the ids, the same way.
        children: JSON.stringify(children.map((c) => toBookingChild(c, bookingMonth))),
        skillIds: selectedSkillIds.join(','),
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
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 200 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <BookingStepProgress step={2} title="Who needs care?" />

        {/* ── Who's coming ──
            Picked from her saved children (Profile → Children). Adding or
            editing a child here saves it to her profile too, so the next
            booking has it. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Children</Text>
          <Text style={styles.sectionHint}>
            {includedChildren} included in the rate
            {extraChildren > 0 && effectiveRate
              ? ` · +${formatMoney(effectiveRate.childFeePerHour, { fractionDigits: 0 })}/hr for ${extraChildren} more`
              : ''}
            {` · up to ${maxChildren} per booking`}
          </Text>
        </View>

        {childrenLoading ? (
          <View style={styles.childrenState}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : childrenError ? (
          <View style={styles.childrenState}>
            <Text style={styles.childrenErrorText}>Could not load your children.</Text>
            <Button title="Try again" variant="outline" onPress={() => void refetchChildren()} />
          </View>
        ) : savedChildren && savedChildren.length === 0 ? (
          <View style={styles.childrenEmpty}>
            <Ionicons name="happy-outline" size={26} color={colors.primaryDark} />
            <Text style={styles.childrenEmptyTitle}>Who is this booking for?</Text>
            <Text style={styles.childrenEmptySub}>
              Add your child once and pick them on every booking after this.
            </Text>
          </View>
        ) : (
          savedChildren?.map((child) => {
            const order = selectedIds.indexOf(child.id);
            const selected = order >= 0;
            const missing = childMissingForBooking(child);
            const disabled = !selected && atMax && !missing;
            const isExtra = selected && order >= includedChildren;
            const snapshot = toBookingChild(child, bookingMonth);
            const health = [formatHealthLine(snapshot), child.healthNotes]
              .filter(Boolean)
              .join(' · ');
            return (
              <View
                key={child.id}
                style={[
                  styles.childCard,
                  selected && styles.childCardSelected,
                  disabled && styles.childCardDisabled,
                ]}
              >
                <Pressable
                  style={styles.childPickRow}
                  onPress={() => toggleChild(child)}
                  disabled={disabled}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected, disabled }}
                  accessibilityLabel={child.name ?? 'Child with no name'}
                >
                  <Ionicons
                    name={selected ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={selected ? colors.primary : colors.textMuted}
                  />
                  <View style={styles.childBody}>
                    <Text style={styles.childName}>{child.name ?? 'Add a name'}</Text>
                    <Text style={styles.childMeta}>
                      {missing
                        ? missing === 'name'
                          ? 'Add a name to book'
                          : 'Add the birth month to book'
                        : formatChildAge(snapshot.ageYears, snapshot.ageMonths)}
                    </Text>
                    {health ? (
                      <View style={styles.childHealth}>
                        <Ionicons name="alert-circle" size={14} color={colors.error} />
                        <Text style={styles.childHealthText}>{health}</Text>
                      </View>
                    ) : null}
                  </View>
                  {isExtra && effectiveRate && effectiveRate.childFeePerHour > 0 && (
                    <View style={styles.childBadge}>
                      <Text style={styles.childBadgeText}>Extra</Text>
                    </View>
                  )}
                </Pressable>
                <Pressable
                  style={styles.childEditBtn}
                  onPress={() => openEdit(child)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${child.name ?? 'child'}`}
                >
                  <Text style={styles.childEditText}>Edit</Text>
                </Pressable>
              </View>
            );
          })
        )}

        {atMax && (savedChildren?.length ?? 0) > maxChildren ? (
          <Text style={styles.sectionHint}>
            One nanny can look after up to {maxChildren} children. Untick one to swap.
          </Text>
        ) : null}

        {!childrenLoading && !childrenError && (
          <Button
            title={savedChildren && savedChildren.length === 0 ? 'Add your child' : 'Add a child'}
            icon="add"
            variant="secondary"
            onPress={openAdd}
          />
        )}

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

      <ChildFormSheet
        visible={sheet.mode !== 'closed'}
        onClose={closeSheet}
        initial={sheet.mode === 'edit' ? sheet.child : undefined}
        onSubmit={handleSaveChild}
        submitting={createChild.isPending || updateChild.isPending}
        error={sheetError}
      />
    </View>
  );
}
