import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

import {
  calculatePriceBreakdown,
  formatChildrenSummary,
  resolveDurationMultiplier,
  type PublicSkill,
} from '@nanny-app/shared';

import { colors } from '@mobile/theme';
import { Chip, CollapsibleCard, Stepper } from '@mobile/components/ui';
import { APP_NAME } from '@mobile/constants';
import { useCreateBooking, usePricingConfig, useValidatePromo } from '@mobile/hooks/useBookings';
import { usePackageHours, usePackages } from '@mobile/hooks/usePackages';
import { useRewardConfig, useRewardWallet } from '@mobile/hooks/useRewards';
import { getApiErrorMessage } from '@mobile/lib/api';
import { formatHourlyRate, formatMoney } from '@mobile/lib/formatMoney';
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

import { useIdGateStore } from '@mobile/store/idGateStore';

import BookingStepProgress from '@mobile/components/BookingStepProgress';
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

export default function BookingStep1Screen() {
  const router = useRouter();
  const params = useLocalSearchParams<BookingFlowParams & {
    startTime: string;
    endTime: string;
  }>();

  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discountAmount: number } | null>(null);
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

  // ── Care Points ─────────────────────────────────────────────────────────
  // Points can only be redeemed against a booking that exists, so here they are
  // *reserved*: the choice rides through the flow and is applied automatically
  // on the confirmation screen the moment a nanny accepts. Which is why the
  // saving is never folded into `total` below — that number is what gets
  // charged now.
  const pointsPerHour = rewardConfig?.redemptionPointsPerHour ?? 0;
  const pointsBalance = wallet?.pointsBalance ?? 0;
  const maxPointHours =
    pointsPerHour > 0 ? Math.min(Math.floor(pointsBalance / pointsPerHour), Math.floor(hours)) : 0;
  const minPointHours =
    pointsPerHour > 0
      ? Math.max(1, Math.ceil((rewardConfig?.minRedemptionPoints ?? 0) / pointsPerHour))
      : 1;
  const canUsePoints =
    (rewardConfig?.enabled ?? false) && maxPointHours >= minPointHours && hours > 0;
  const pointsSaving = breakdown ? pointsHours * breakdown.effectiveHourlyRate : 0;

  const totalSaved = durationDiscount + promoDiscount + pointsSaving;

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
    draftReady && hourlyRate != null && hours > 0 && children.length > 0 && !isPricingLoading;

  /**
   * The stepper runs 0…max, but the program may impose a floor on a single
   * redemption. Snap past the dead zone in whichever direction the mother moved.
   */
  const handlePointsChange = (next: number) => {
    if (next === 0 || next >= minPointHours) {
      setPointsHours(next);
      return;
    }
    setPointsHours(next > pointsHours ? Math.min(minPointHours, maxPointHours) : 0);
  };

  const appendInstructionTag = (tag: string) => {
    setInstructions((prev) => {
      if (prev.toLowerCase().includes(tag.toLowerCase())) return prev;
      return prev.trim().length > 0 ? `${prev.trim()}\n${tag}: ` : `${tag}: `;
    });
  };

  const handleApplyPromo = () => {
    const code = promoCode.trim();
    if (code.length === 0) return;
    validatePromo.mutate(
      { code, subtotal: breakdown?.subtotal ?? baseCost },
      { onSuccess: (res) => setAppliedPromo({ code, discountAmount: res.discountAmount }) },
    );
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setPromoCode('');
    validatePromo.reset();
  };

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
    if (!params.startTimeWall || !params.endTimeWall) return;

    setSubmitError(null);
    try {
      const created = await createBooking.mutateAsync({
        startTime: params.startTimeWall,
        endTime: params.endTimeWall,
        ...(instructions.trim() ? { specialInstructions: instructions.trim() } : {}),
        ...(appliedPromo ? { promoCode: appliedPromo.code } : {}),
        skillIds: selectedSkillIds,
        children,
        ...(params.saveChildren === '1' ? { saveChildren: true } : {}),
      });
      router.replace({
        pathname: '/(parent)/book/booking-confirmation',
        params: {
          bookingId: String(created.id),
          ...(pointsHours > 0 ? { pointsHours: String(pointsHours) } : {}),
        },
      } as never);
    } catch (err) {
      const message = getApiErrorMessage(err, 'Could not submit your request. Please try again.');
      // Backstop: if the server gated the booking on a missing ID (a mother who
      // slipped past the home-screen gate, e.g. stale profile), prompt her to
      // upload rather than showing a dead-end error.
      if (message.toLowerCase().includes('upload your id')) {
        useIdGateStore.getState().openIdGate();
      }
      setSubmitError(message);
    }
  };

  const promoDisabled =
    appliedPromo != null || promoCode.trim().length === 0 || validatePromo.isPending;

  const summaryLine = useMemo(
    () =>
      [dateDisplay, timeDisplay, hours > 0 ? formatDurationHours(hours) : null]
        .filter(Boolean)
        .join(' · '),
    [dateDisplay, timeDisplay, hours],
  );

  // Children arrive from the care step, so a deep link straight to this screen
  // can land here without them. Say so and send her back — a disabled CTA with
  // no explanation is the worse failure.
  if (!draftReady || children.length === 0) {
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
            <Text style={styles.whenDate}>{formatChildrenSummary(children)}</Text>
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
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Promo code</Text>
          {appliedPromo ? (
            <View style={styles.promoChip}>
              <Ionicons name="checkmark-circle" size={16} color={colors.successDark} />
              <Text style={styles.promoChipText}>
                {appliedPromo.code} — {formatMoney(appliedPromo.discountAmount)} off
              </Text>
              <TouchableOpacity onPress={handleRemovePromo} activeOpacity={0.7} hitSlop={8}>
                <Ionicons name="close" size={16} color={colors.successDark} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.promoInputRow}>
              <TextInput
                style={styles.promoInput}
                placeholder="Enter code"
                placeholderTextColor={colors.textPlaceholder}
                value={promoCode}
                onChangeText={setPromoCode}
                autoCapitalize="characters"
              />
              <TouchableOpacity
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

        {/* ── Care Points ── */}
        {canUsePoints && (
          <View style={styles.section}>
            <View style={styles.pointsHeader}>
              <Ionicons name="gift-outline" size={16} color={colors.goldWarm} />
              <Text style={styles.sectionTitle}>Care Points</Text>
              <Text style={styles.pointsBalance}>{pointsBalance} pts</Text>
            </View>
            <Text style={styles.sectionHint}>
              Swap {pointsPerHour} points for a free hour — up to {maxPointHours} on this booking.
            </Text>
            <View style={styles.pointsRow}>
              <Stepper
                value={pointsHours}
                onChange={handlePointsChange}
                min={0}
                max={maxPointHours}
                suffix="h free"
                size="sm"
              />
              <Text style={styles.pointsSaving}>
                {pointsHours > 0 ? `−${formatMoney(pointsSaving)}` : 'None reserved'}
              </Text>
            </View>
            {pointsHours > 0 && (
              <Text style={styles.pointsNote}>
                Applied automatically once a nanny accepts — you’ll pay the reduced amount.
              </Text>
            )}
          </View>
        )}

        {/* ── Prepaid hours ── */}
        {prepaidHours > 0 ? (
          <View style={styles.prepaidRow}>
            <Ionicons name="time-outline" size={16} color={colors.successDark} />
            <Text style={styles.prepaidText}>
              {prepaidHours}h prepaid will be applied to this booking
            </Text>
          </View>
        ) : (
          bestPackagePercentOff > 0 && (
            <Pressable
              style={styles.packageNudge}
              onPress={() => router.push('/(parent)/packages' as never)}
            >
              <Ionicons name="time-outline" size={18} color={colors.primaryDark} />
              <View style={styles.packageNudgeBody}>
                <Text style={styles.packageNudgeTitle}>
                  Save up to {bestPackagePercentOff}% with prepaid hours
                </Text>
                <Text style={styles.packageNudgeSub}>
                  Buy a bundle once — it applies to your bookings automatically.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          )
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
            {pointsHours > 0 && (
              <View style={styles.savingsLine}>
                <Text style={styles.savingsLineLabel}>
                  {pointsHours} free hour{pointsHours === 1 ? '' : 's'} · Care Points
                </Text>
                <Text style={styles.savingsLineValue}>−{formatMoney(pointsSaving)}</Text>
              </View>
            )}

            {pointsHours > 0 && (
              <Text style={styles.savingsFootnote}>
                Care Points come off once a nanny accepts, before you pay.
              </Text>
            )}
          </View>
        )}

        {/* ── Price ── */}
        {isPricingLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <CollapsibleCard
            title="Price details"
            summary={formatMoney(total)}
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
            <View style={styles.priceDivider} />
            <View style={styles.priceRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatMoney(total)}</Text>
            </View>
            {pointsHours > 0 && (
              <Text style={styles.pendingCreditNote}>
                {pointsHours} free hour{pointsHours === 1 ? '' : 's'} reserved (−
                {formatMoney(pointsSaving)}) — applied once a nanny accepts, before you pay.
              </Text>
            )}
          </CollapsibleCard>
        )}

        {/* ── Instructions ── */}
        <View style={styles.section}>
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
        total={formatMoney(total)}
        totalLabel="You’ll pay"
        ctaLabel={`Request care · ${formatMoney(total)}`}
        onPress={() => void handleProceed()}
        disabled={!canProceed}
        loading={isPricingLoading || createBooking.isPending}
      >
        {submitError && (
          <View style={styles.submitErrorRow}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
            <Text style={styles.submitErrorText}>{submitError}</Text>
          </View>
        )}
      </BookingSummaryBar>
    </View>
  );
}
