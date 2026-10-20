import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Text, TextInput } from '@mobile/components/ui/text';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

import {
  calculatePriceBreakdown,
  formatChildAge,
  formatChildrenSummary,
  resolveDurationMultiplier,
  type BookingChild,
  type PublicSkill,
} from '@nanny-app/shared';

import { colors, spacing } from '@mobile/theme';
import { Chip, CollapsibleCard, KeyboardAvoidingView } from '@mobile/components/ui';
import { APP_NAME } from '@mobile/constants';
import { useCreateBooking, usePricingConfig, useValidatePromo } from '@mobile/hooks/useBookings';
import { usePackageHours, usePackages } from '@mobile/hooks/usePackages';
import { useRewardConfig, useRewardWallet } from '@mobile/hooks/useRewards';
import { getApiErrorMessage } from '@mobile/lib/api';
import { planBookingCredits } from '@mobile/lib/bookingCredits';
import { formatHourlyRate, formatMoney } from '@mobile/lib/formatMoney';
import { formatDurationHours } from '@mobile/lib/formatTime';
import { sectionScrollTarget, type SectionRect } from '@mobile/lib/sectionScroll';
import {
  formatBookingRecap,
  getBookingDateDisplay,
  getBookingDurationHours,
  getBookingTimeDisplay,
  hasRequiredBookingDraft,
  parseChildIdsParam,
  parseChildrenParam,
  parseSkillIdsParam,
  type BookingFlowParams,
} from '@mobile/lib/bookingDraft';

import { useIdGateStore } from '@mobile/store/idGateStore';
import { usePendingPromoStore } from '@mobile/store/pendingPromoStore';

import BookingStepProgress from '@mobile/components/BookingStepProgress';
import { PayingWithCard } from '@mobile/components/booking/PayingWithCard';
import BookingSummaryBar from '@mobile/components/BookingSummaryBar';
import { styles } from './styles/booking-step1-screen.styles';

/** One-tap prompts for the instructions box — a blank textarea gets skipped. */
const INSTRUCTION_TAGS = ['Allergies', 'Nap routine', 'Meals', 'Pets', 'House rules'] as const;

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

/** "Lina (3 yrs), Omar (8 mos)" — falls back to the nameless summary. */
function formatPickedChildren(children: readonly BookingChild[]): string {
  if (children.some((c) => !c.name?.trim())) return formatChildrenSummary(children);
  return children
    .map((c) => `${c.name!.trim()}\u00A0(${formatChildAge(c.ageYears, c.ageMonths)})`)
    .join(', ');
}

export default function BookingStep1Screen() {
  const scrollRef = useRef<ScrollView>(null);
  // Where the two typed-in sections start in the scroll. When the keyboard
  // opens the scroll shrinks above the footer, and Android only brings the
  // field itself into view, so the section's title stays cut off; the scroll
  // re-aims at the whole section once its new height lands.
  // A section taller than what is left of the scroll lines up its bottom
  // instead, so the box being typed in stays above the footer.
  const sections = useRef<Record<'promo' | 'instructions', SectionRect>>({
    promo: { y: 0, height: 0 },
    instructions: { y: 0, height: 0 },
  });
  const scrollHeight = useRef(0);
  const focusedSection = useRef<'promo' | 'instructions' | null>(null);
  const showSection = (key: 'promo' | 'instructions') =>
    scrollRef.current?.scrollTo({
      y: sectionScrollTarget(sections.current[key], scrollHeight.current, spacing.xs),
      animated: true,
    });
  const typingProps = (key: 'promo' | 'instructions') => ({
    onFocus: () => {
      focusedSection.current = key;
      showSection(key);
    },
    onBlur: () => {
      focusedSection.current = null;
    },
  });
  const router = useRouter();
  const params = useLocalSearchParams<BookingFlowParams & {
    startTime: string;
    endTime: string;
  }>();

  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discountAmount: number } | null>(null);

  const pendingPromoCode = usePendingPromoStore((s) => s.pendingPromoCode);
  const clearPendingPromo = usePendingPromoStore((s) => s.clear);

  // A campaign banner or an announcement can hand a code to the booking flow.
  // Read it once on mount and clear it so it never rides along into a later,
  // unrelated booking; it is applied below once the price it discounts exists.
  const [autoApplyCode, setAutoApplyCode] = useState<string | null>(null);
  const autoApplied = useRef(false);
  useEffect(() => {
    if (pendingPromoCode) {
      setPromoCode(pendingPromoCode);
      setAutoApplyCode(pendingPromoCode);
      clearPendingPromo();
    }
    // Run once on mount; the store is a one-shot handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [instructions, setInstructions] = useState('');
  const [pointsHours, setPointsHours] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const validatePromo = useValidatePromo();
  const createBooking = useCreateBooking();

  const draftReady = hasRequiredBookingDraft(params);
  const { data: pricing, isLoading: isPricingLoading } = usePricingConfig();
  const { data: wallet } = useRewardWallet();
  const { data: rewardConfig } = useRewardConfig();
  const { data: packageHours } = usePackageHours();
  const { data: packages } = usePackages();

  const dateDisplay = getBookingDateDisplay(params);
  const timeDisplay = getBookingTimeDisplay(params);
  const hours = getBookingDurationHours(params);

  const hourlyRate = pricing?.standardHourlyRate ?? null;
  const promoDiscount = appliedPromo?.discountAmount ?? 0;

  // Children and skills are settled on the care step; this screen only
  // reports what they cost. Reading them straight from the params (rather than
  // holding state) is what keeps the two screens from disagreeing.
  const children = useMemo(() => parseChildrenParam(params.children), [params.children]);
  const childIds = useMemo(() => parseChildIdsParam(params.childIds), [params.childIds]);
  const selectedSkillIds = useMemo(() => parseSkillIdsParam(params.skillIds), [params.skillIds]);

  const addOns = pricing?.skillAddOns ?? [];
  const selectedAddOns = addOns.filter((s) => selectedSkillIds.includes(s.id));
  const addOnsTotal =
    hourlyRate != null
      ? selectedAddOns.reduce((sum, s) => sum + addOnAmount(s, hourlyRate, hours), 0)
      : 0;

  // Live estimate using the shared pricing engine — the same math the server
  // runs when the request is created, so what the parent sees is what she pays.
  const breakdown =
    pricing && hours > 0
      ? calculatePriceBreakdown({
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
          discountAmount: promoDiscount,
          nannyPercent: pricing.nannyPercent,
          platformPercent: pricing.platformPercent,
        })
      : null;

  const extraChildCost = breakdown ? breakdown.extraChildFeePerHour * hours : 0;

  const baseCost = hourlyRate != null ? hourlyRate * hours : 0;
  const rawSubtotal = breakdown ? breakdown.effectiveHourlyRate * hours : 0;
  const durationDiscount = breakdown ? rawSubtotal - breakdown.subtotal : 0;
  const total = breakdown?.totalAmount ?? 0;

  // ── Package hours & Care Points ─────────────────────────────────────────
  // Applied in the server's order: a usable package is always used first, and
  // Care Points can only buy the hours it leaves owed. Both are taken when the
  // request is sent (and returned if it is cancelled before a nanny accepts),
  // so the amount she actually pays is the total net of both — that net figure
  // is what the price card and CTA show, and at zero there is no payment step.
  const pointsBalance = wallet?.pointsBalance ?? 0;
  const credits = planBookingCredits({
    baseRate: breakdown?.baseRate ?? 0,
    effectiveHourlyRate: breakdown?.effectiveHourlyRate ?? 0,
    durationMultiplier: breakdown?.durationMultiplier ?? 1,
    durationHours: hours,
    totalAmount: total,
    skillFeesPerHour: breakdown?.skillAddOns.map((s) => s.amountPerHour) ?? [],
    packageBalance: packageHours,
    pointsBalance,
    rewardConfig,
    pointsHours,
  });
  // Keep the stepper honest when the cap drops under it (a promo applied, the
  // booking shortened): the choice snaps to what can still be spent, rather
  // than reappearing later as a number she never re-picked.
  const pointsCap = credits.points.maxHours;
  useEffect(() => {
    if (pointsHours > pointsCap) setPointsHours(credits.points.hoursApplied);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsCap]);

  const packageCredit = credits.package?.creditAmount ?? 0;
  const appliedPointHours = credits.points.hoursApplied;
  const pointsSaving = credits.points.saving;
  const netTotal = breakdown ? credits.netTotal : 0;

  const totalSaved = durationDiscount + promoDiscount + packageCredit + pointsSaving;

  // ── Prepaid packages ────────────────────────────────────────────────────
  // Buying hours in bulk is the single biggest lever on what care costs, and it
  // was previously only discoverable three taps into the Account tab. Surface
  // it at the moment the price is on screen — but only when she has no prepaid
  // hours already (they're applied server-side and would make this noise).
  const prepaidHours = packageHours?.availableHours ?? 0;
  const bestPackagePercentOff = useMemo(() => {
    if (prepaidHours > 0 || hourlyRate == null || hourlyRate <= 0) return 0;
    const rates = (packages ?? [])
      .filter((p) => p.hours > 0)
      .map((p) => p.price / p.hours)
      .filter((rate) => rate < hourlyRate);
    if (rates.length === 0) return 0;
    return Math.round((1 - Math.min(...rates) / hourlyRate) * 100);
  }, [packages, prepaidHours, hourlyRate]);

  const canProceed =
    draftReady &&
    hourlyRate != null &&
    hours > 0 &&
    children.length > 0 &&
    childIds.length > 0 &&
    !isPricingLoading;

  /**
   * The stepper runs 0…max, but the program may impose a floor on a single
   * redemption. Snap past the dead zone in whichever direction the mother moved.
   */
  const handlePointsChange = (next: number) => {
    const { minHours, maxHours } = credits.points;
    if (next === 0 || next >= minHours) {
      setPointsHours(next);
      return;
    }
    setPointsHours(next > appliedPointHours ? Math.min(minHours, maxHours) : 0);
  };

  const appendInstructionTag = (tag: string) => {
    setInstructions((prev) => {
      if (prev.toLowerCase().includes(tag.toLowerCase())) return prev;
      return prev.trim().length > 0 ? `${prev.trim()}\n${tag}: ` : `${tag}: `;
    });
  };

  const applyPromoCode = (code: string) => {
    validatePromo.mutate(
      { code, subtotal: breakdown?.subtotal ?? baseCost },
      { onSuccess: (res) => setAppliedPromo({ code, discountAmount: res.discountAmount }) },
    );
  };

  const handleApplyPromo = () => {
    const code = promoCode.trim();
    if (code.length === 0) return;
    applyPromoCode(code);
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setPromoCode('');
    validatePromo.reset();
  };

  // Editing a refused code is her answer to the error, so the error goes.
  const handlePromoCodeChange = (text: string) => {
    setPromoCode(text);
    if (validatePromo.isError) validatePromo.reset();
  };

  // The handed-over code is validated exactly once, as soon as the breakdown
  // (the subtotal it is checked against) exists. Success shows the usual applied
  // chip; a refusal shows the usual inline error with the code left in the
  // field — she can edit or clear it, and the request goes ahead without it.
  // The ref, not the state, is the once-guard: it also holds under StrictMode's
  // double-run effects.
  const breakdownReady = breakdown !== null;
  useEffect(() => {
    if (!autoApplyCode || !breakdownReady || autoApplied.current) return;
    autoApplied.current = true;
    applyPromoCode(autoApplyCode.trim());
    // applyPromoCode is recreated every render; the guard makes this run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApplyCode, breakdownReady]);

  /**
   * Submits the request from here and goes straight to the matching screen.
   *
   * This used to hop through the checkout screen, which showed a full-screen
   * "Submitting your request…" spinner for the length of one API call and then
   * replaced itself with "Finding a nanny" — two waiting screens back to back
   * for a single action. The button's own pending state covers it.
   */
  const handleProceed = async () => {
    if (!canProceed || createBooking.isPending) return;
    if (!params.startTimeWall || !params.endTimeWall || !params.addressId) return;

    setSubmitError(null);
    try {
      const created = await createBooking.mutateAsync({
        startTime: params.startTimeWall,
        endTime: params.endTimeWall,
        // Chosen on the Where step; the server snapshots it onto the booking.
        addressId: Number(params.addressId),
        ...(instructions.trim() ? { specialInstructions: instructions.trim() } : {}),
        ...(appliedPromo ? { promoCode: appliedPromo.code } : {}),
        skillIds: selectedSkillIds,
        // The server snapshots these from her profile, aged on the booking date.
        childIds,
        // Spent with the request, so a request they fully cover is confirmed
        // the moment a nanny accepts — no payment step.
        // Only what is still owed after the package — the server trims to the
        // same figure, so a stale choice can never cost extra points.
        ...(appliedPointHours > 0 ? { redeemPointsHours: appliedPointHours } : {}),
      });
      router.replace({
        pathname: '/(parent)/book/booking-confirmation',
        params: { bookingId: String(created.id) },
      } as never);
    } catch (err) {
      const message = getApiErrorMessage(err, 'Could not submit your request. Please try again.');
      // Backstop: if the server gated the booking on something missing (a
      // mother who slipped past the home-screen gates, e.g. stale profile),
      // prompt her for it rather than showing a dead-end error.
      const lower = message.toLowerCase();
      if (lower.includes('upload your id')) {
        useIdGateStore.getState().openIdGate();
      }
      setSubmitError(message);
    }
  };

  const promoDisabled =
    appliedPromo != null || promoCode.trim().length === 0 || validatePromo.isPending;

  const summaryLine = useMemo(
    () =>
      formatBookingRecap([dateDisplay, timeDisplay, hours > 0 ? formatDurationHours(hours) : null]),
    [dateDisplay, timeDisplay, hours],
  );

  // Children arrive from the care step, so a deep link straight to this screen
  // can land here without them. Say so and send her back — a disabled CTA with
  // no explanation is the worse failure.
  if (!draftReady || children.length === 0 || childIds.length === 0) {
    return (
      <View style={[styles.container, styles.centeredState]}>
        <Text style={styles.missingParamsText}>
          {draftReady
            ? 'Tell us who needs care to continue.'
            : 'Select a date and time to continue.'}
        </Text>
        <TouchableOpacity style={styles.missingParamsBtn} onPress={() => router.back()}>
          <Text style={styles.missingParamsBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container}>
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
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: spacing.lg }]}
        onLayout={(e) => {
          scrollHeight.current = e.nativeEvent.layout.height;
          if (focusedSection.current) showSection(focusedSection.current);
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BookingStepProgress step={3} title="Review your request" />

        {/* ── When ── */}
        <View style={styles.whenCard}>
          <View style={styles.whenIcon}>
            <Ionicons name="calendar-outline" size={20} color={colors.primaryDark} />
          </View>
          <View style={styles.whenBody}>
            <Text style={styles.whenDate}>{dateDisplay}</Text>
            <Text style={styles.whenTime}>
              {timeDisplay} · {formatDurationHours(hours)}
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} hitSlop={8}>
            <Text style={styles.whenEdit}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* ── Care details ──
            A read-only recap of the previous step. Editing goes back rather than
            duplicating the pickers here, so there is exactly one place where
            children and skills are chosen. */}
        <View style={styles.whenCard}>
          <View style={styles.whenIcon}>
            <Ionicons name="people-outline" size={20} color={colors.primaryDark} />
          </View>
          <View style={styles.whenBody}>
            {/* Her own review, so the names she picked — the open pool is what
                gets the nameless summary. */}
            <Text style={styles.whenDate}>{formatPickedChildren(children)}</Text>
            <Text style={styles.whenTime}>
              {selectedAddOns.length > 0
                ? `${selectedAddOns.map((s) => s.name).join(', ')} · +${formatMoney(addOnsTotal)}`
                : 'No skills requested'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} hitSlop={8}>
            <Text style={styles.whenEdit}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* ── Promo code ── */}
        <View
          style={styles.section}
          onLayout={(e) => {
            sections.current.promo = e.nativeEvent.layout;
          }}
        >
          <Text style={styles.sectionTitle}>Promo code</Text>
          {appliedPromo ? (
            <View style={styles.promoChip}>
              <Ionicons name="checkmark-circle" size={16} color={colors.successDark} />
              <Text style={styles.promoChipText}>
                {appliedPromo.code} — {formatMoney(appliedPromo.discountAmount)} off
              </Text>
              <TouchableOpacity
                onPress={handleRemovePromo}
                activeOpacity={0.7}
                // 16dp icon + 14dp each side: the 44dp minimum target.
                hitSlop={14}
                accessibilityRole="button"
                accessibilityLabel={`Remove promo code ${appliedPromo.code}`}
              >
                <Ionicons name="close" size={16} color={colors.successDark} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.promoInputRow}>
              <TextInput
                testID="booking.promoInput"
                style={styles.promoInput}
                placeholder="Enter code"
                placeholderTextColor={colors.textPlaceholder}
                value={promoCode}
                onChangeText={handlePromoCodeChange}
                autoCapitalize="characters"
                {...typingProps('promo')}
              />
              <TouchableOpacity
                testID="booking.promoApply"
                style={[styles.promoApplyBtn, promoDisabled && styles.promoApplyBtnDisabled]}
                onPress={handleApplyPromo}
                activeOpacity={0.7}
                disabled={promoDisabled}
              >
                <Text style={styles.promoApplyText}>
                  {validatePromo.isPending ? '…' : 'Apply'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {validatePromo.isError && !appliedPromo && (
            <Text style={styles.promoErrorText}>
              {validatePromo.error.message || 'That promo code could not be applied.'}
            </Text>
          )}
        </View>

        {/* ── Paying with ── package first, then Care Points for the rest. */}
        {breakdown && (
          <PayingWithCard
            plan={credits}
            totalBeforeCredits={total}
            pointsBalance={pointsBalance}
            pointsHours={pointsHours}
            onPointsChange={handlePointsChange}
          />
        )}

        {/* No package yet: buying hours in bulk is the biggest lever on what care
            costs, so surface it while the price is on screen. */}
        {prepaidHours <= 0 && bestPackagePercentOff > 0 && (
          <Pressable
            style={styles.packageNudge}
            onPress={() => router.push('/(parent)/packages' as never)}
          >
            <Ionicons name="time-outline" size={18} color={colors.primaryDark} />
            <View style={styles.packageNudgeBody}>
              <Text style={styles.packageNudgeTitle}>
                Save up to {bestPackagePercentOff}% with packages
              </Text>
              <Text style={styles.packageNudgeSub}>
                Buy a bundle once — it applies to your bookings automatically.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        )}

        {/* ── What you saved ──
            Read-only tally, deliberately separate from the promo input: most of
            these savings have nothing to do with a code, and putting a number in
            the promo card's header implied the code earned it. */}
        {totalSaved > 0.005 && (
          <View style={styles.savingsCard}>
            <View style={styles.savingsHeader}>
              <Ionicons name="pricetag" size={16} color={colors.successDark} />
              <Text style={styles.savingsTitle}>You’re saving</Text>
              <Text style={styles.savingsTotal}>{formatMoney(totalSaved)}</Text>
            </View>

            {durationDiscount > 0.005 && (
              <View style={styles.savingsLine}>
                <Text style={styles.savingsLineLabel}>Longer-booking discount</Text>
                <Text style={styles.savingsLineValue}>−{formatMoney(durationDiscount)}</Text>
              </View>
            )}
            {appliedPromo && (
              <View style={styles.savingsLine}>
                <Text style={styles.savingsLineLabel}>Promo {appliedPromo.code}</Text>
                <Text style={styles.savingsLineValue}>−{formatMoney(promoDiscount)}</Text>
              </View>
            )}
            {credits.package && (
              <View style={styles.savingsLine}>
                <Text style={styles.savingsLineLabel}>
                  {formatDurationHours(credits.package.hoursApplied)} from your package
                </Text>
                <Text style={styles.savingsLineValue}>−{formatMoney(packageCredit)}</Text>
              </View>
            )}
            {appliedPointHours > 0 && (
              <View style={styles.savingsLine}>
                <Text style={styles.savingsLineLabel}>
                  {appliedPointHours} free hour{appliedPointHours === 1 ? '' : 's'} · Care Points
                </Text>
                <Text style={styles.savingsLineValue}>−{formatMoney(pointsSaving)}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Price ── */}
        {isPricingLoading ? (
          <ActivityIndicator color={colors.primaryDark} />
        ) : (
          <CollapsibleCard
            title="Price details"
            summary={formatMoney(netTotal)}
            icon="receipt-outline"
          >
            <View style={styles.priceRow}>
              <View style={styles.priceRowLabel}>
                <Text style={styles.priceLabel}>Base rate</Text>
                <Text style={styles.priceMath}>
                  {hourlyRate != null ? formatHourlyRate(hourlyRate) : '—'} ×{' '}
                  {formatDurationHours(hours)}
                </Text>
              </View>
              <Text style={styles.priceValue}>{formatMoney(baseCost)}</Text>
            </View>

            {/* Extra children, itemised the same way. The count and the per-hour
                figure are both spelled out so "why is this more than last time?"
                answers itself. */}
            {breakdown && breakdown.extraChildren > 0 && (
              <View style={styles.priceRow}>
                <View style={styles.priceRowLabel}>
                  <Text style={styles.addOnRowLabel}>
                    + {breakdown.extraChildren} extra child
                    {breakdown.extraChildren === 1 ? '' : 'ren'}
                  </Text>
                  <Text style={styles.priceMath}>
                    {formatHourlyRate(breakdown.extraChildFeePerHour)} ×{' '}
                    {formatDurationHours(hours)} · {breakdown.includedChildren} included
                  </Text>
                </View>
                <Text style={styles.addOnRowValue}>+{formatMoney(extraChildCost)}</Text>
              </View>
            )}

            {/* Each skill shows its own arithmetic. A bare "+EGP 120" gave
                the mother no way to check where it came from, and percentage
                add-ons are resolved to money by the pricing engine, so the
                configured "+15%" never appeared anywhere she could see. */}
            {breakdown?.skillAddOns.map((addon) => (
              <View style={styles.priceRow} key={addon.id}>
                <View style={styles.priceRowLabel}>
                  <Text style={styles.addOnRowLabel}>+ {addon.name}</Text>
                  <Text style={styles.priceMath}>
                    {formatHourlyRate(addon.amountPerHour)} × {formatDurationHours(hours)}
                  </Text>
                </View>
                <Text style={styles.addOnRowValue}>
                  +{formatMoney(addon.amountPerHour * hours)}
                </Text>
              </View>
            ))}

            {durationDiscount > 0.005 && (
              <View style={styles.priceRow}>
                <View style={styles.priceRowLabel}>
                  <Text style={styles.promoLabel}>Longer-booking discount</Text>
                  {breakdown && (
                    <Text style={styles.priceMath}>
                      {Math.round((1 - breakdown.durationMultiplier) * 100)}% off {formatDurationHours(hours)}+
                    </Text>
                  )}
                </View>
                <Text style={styles.promoValue}>–{formatMoney(durationDiscount)}</Text>
              </View>
            )}
            {appliedPromo && (
              <View style={styles.priceRow}>
                <Text style={styles.promoLabel}>Promo</Text>
                <Text style={styles.promoValue}>–{formatMoney(promoDiscount)}</Text>
              </View>
            )}
            {credits.package && (
              <View style={styles.priceRow}>
                <View style={styles.priceRowLabel}>
                  <Text style={styles.promoLabel}>Package hours</Text>
                  <Text style={styles.priceMath}>
                    {formatDurationHours(credits.package.hoursApplied)} from {credits.package.packageName}
                  </Text>
                </View>
                <Text style={styles.promoValue}>–{formatMoney(packageCredit)}</Text>
              </View>
            )}
            {appliedPointHours > 0 && (
              <View style={styles.priceRow}>
                <View style={styles.priceRowLabel}>
                  <Text style={styles.promoLabel}>
                    {appliedPointHours} free hour{appliedPointHours === 1 ? '' : 's'} · Care Points
                  </Text>
                  <Text style={styles.priceMath}>from your balance</Text>
                </View>
                <Text style={styles.promoValue}>–{formatMoney(pointsSaving)}</Text>
              </View>
            )}
            <View style={styles.priceDivider} />
            <View style={styles.priceRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatMoney(netTotal)}</Text>
            </View>
          </CollapsibleCard>
        )}

        {/* ── Instructions ── */}
        <View
          style={styles.section}
          onLayout={(e) => {
            sections.current.instructions = e.nativeEvent.layout;
          }}
        >
          <Text style={styles.sectionTitle}>Anything we should know?</Text>
          <View style={styles.tagRow}>
            {INSTRUCTION_TAGS.map((tag) => (
              <Chip
                key={tag}
                label={tag}
                size="sm"
                inactiveColor={colors.taupeLight}
                onPress={() => appendInstructionTag(tag)}
              />
            ))}
          </View>
          <TextInput
            style={styles.instructionsInput}
            value={instructions}
            onChangeText={setInstructions}
            placeholder="Allergies, routines, house rules..."
            placeholderTextColor={colors.textPlaceholder}
            multiline
            textAlignVertical="top"
            {...typingProps('instructions')}
          />
        </View>

        <View style={styles.guaranteeCard}>
          <Ionicons name="people-outline" size={20} color={colors.success} />
          <Text style={styles.guaranteeText}>
            We send your request to every available nanny. The first to accept takes it.
          </Text>
        </View>
      </ScrollView>

      <BookingSummaryBar
        summary={summaryLine}
        total={formatMoney(netTotal)}
        totalLabel="You’ll pay"
        ctaLabel={
          breakdown && netTotal <= 0 ? 'Request care · Covered' : `Request care · ${formatMoney(netTotal)}`
        }
        onPress={() => void handleProceed()}
        disabled={!canProceed}
        loading={isPricingLoading || createBooking.isPending}
      >
        {/* Covered in full: say up front there will be no payment step, so the
            EGP 0 on the button reads as intended rather than as a glitch. */}
        {breakdown && netTotal <= 0 && !submitError && (
          <View style={styles.freeNoteRow}>
            <Ionicons name="checkmark-circle" size={16} color={colors.successDark} />
            <Text style={styles.freeNoteText}>
              Nothing to pay — your booking is confirmed as soon as a nanny accepts.
            </Text>
          </View>
        )}
        {submitError && (
          <View style={styles.submitErrorRow}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
            <Text style={styles.submitErrorText}>{submitError}</Text>
          </View>
        )}
      </BookingSummaryBar>
    </KeyboardAvoidingView>
  );
}
