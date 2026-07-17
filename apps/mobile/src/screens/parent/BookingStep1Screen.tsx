import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

import {
  calculatePriceBreakdown,
  resolveDurationMultiplier,
  type PublicSkill,
} from '@nanny-app/shared';

import { colors, spacing, borderRadius } from '@mobile/theme';
import { Card, Chip } from '@mobile/components/ui';
import { APP_NAME } from '@mobile/constants';
import { usePricingConfig, useValidatePromo } from '@mobile/hooks/useBookings';
import { formatMoney } from '@mobile/lib/formatMoney';
import {
  getBookingDateDisplay,
  getBookingDurationHours,
  getBookingTimeDisplay,
  hasRequiredBookingDraft,
  type BookingFlowParams,
} from '@mobile/lib/bookingDraft';

import BookingStepProgress from '@mobile/components/BookingStepProgress';
import { styles } from './styles/booking-step1-screen.styles';

export default function BookingStep1Screen() {
  const router = useRouter();
  const params = useLocalSearchParams<BookingFlowParams & {
    startTime: string;
    endTime: string;
  }>();

  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discountAmount: number } | null>(null);
  const [instructions, setInstructions] = useState('');
  const [selectedSkillIds, setSelectedSkillIds] = useState<number[]>([]);
  const validatePromo = useValidatePromo();

  const draftReady = hasRequiredBookingDraft(params);
  const { data: pricing, isLoading: isPricingLoading } = usePricingConfig();

  const dateDisplay = getBookingDateDisplay(params);
  const timeDisplay = getBookingTimeDisplay(params);
  const hours = getBookingDurationHours(params);

  const hourlyRate = pricing?.standardHourlyRate ?? null;
  const promoDiscount = appliedPromo?.discountAmount ?? 0;

  const addOns = pricing?.skillAddOns ?? [];
  const selectedAddOns = addOns.filter((s) => selectedSkillIds.includes(s.id));

  // Live estimate using the shared pricing engine — the same math the server
  // runs when the request is created, so what the parent sees is what she pays.
  const breakdown =
    pricing && hours > 0
      ? calculatePriceBreakdown({
          baseRate: pricing.standardHourlyRate,
          durationHours: hours,
          skillAddOns: selectedAddOns,
          durationMultiplier: resolveDurationMultiplier(hours, pricing.durationRules),
          discountAmount: promoDiscount,
          nannyPercent: pricing.nannyPercent,
          platformPercent: pricing.platformPercent,
        })
      : null;

  const baseCost = hourlyRate != null ? hourlyRate * hours : 0;
  const rawSubtotal = breakdown ? breakdown.effectiveHourlyRate * hours : 0;
  const durationDiscount = breakdown ? rawSubtotal - breakdown.subtotal : 0;
  const total = breakdown?.totalAmount ?? 0;

  const canProceed = draftReady && hourlyRate != null && hours > 0 && !isPricingLoading;

  const toggleSkill = (id: number) => {
    setAppliedPromo(null); // add-ons change the price → re-validate any promo
    setSelectedSkillIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  const skillChipLabel = (skill: PublicSkill): string => {
    if (skill.feeType === 'FLAT') {
      return `${skill.name} · +${formatMoney(skill.feeValue, { fractionDigits: 0 })}/hr`;
    }
    if (skill.feeType === 'PERCENTAGE') return `${skill.name} · +${skill.feeValue}%`;
    return skill.name;
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

  const handleProceed = () => {
    if (!canProceed) return;
    router.push({
      pathname: '/(parent)/book/booking-step-3',
      params: {
        date: dateDisplay,
        dateIso: params.dateIso,
        startTimeWall: params.startTimeWall,
        endTimeWall: params.endTimeWall,
        durationHours: params.durationHours,
        total: total.toFixed(2),
        ...(appliedPromo ? { promoCode: appliedPromo.code } : {}),
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
        ...(selectedSkillIds.length ? { skillIds: selectedSkillIds.join(',') } : {}),
        bookingId: '',
        retry: '',
      },
    } as never);
  };

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
      >
        <BookingStepProgress step={2} title="Review your request" centered />

        <Card shadow="sm" padding={spacing.lg} radius={borderRadius.xl}>
          <View style={styles.nannyCardInner}>
            <View style={[styles.nannyPhoto, styles.nannyPhotoPlaceholder]}>
              <Ionicons name="calendar-outline" size={24} color={colors.primary} />
            </View>
            <View style={styles.nannyInfo}>
              <View style={styles.nannyNameRow}>
                <Text style={styles.nannyName}>Care request</Text>
              </View>
              <View style={styles.nannyDateRow}>
                <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.nannyDateText}>
                  {dateDisplay} · {timeDisplay} · {hours} hours
                </Text>
              </View>
            </View>
          </View>
        </Card>

        {addOns.length > 0 && (
          <View style={styles.addOnSection}>
            <Text style={styles.addOnTitle}>Add-ons</Text>
            <Text style={styles.addOnHint}>
              Tap the specialties you need — the fee is added to the hourly rate.
            </Text>
            <View style={styles.addOnChips}>
              {addOns.map((skill) => (
                <Chip
                  key={skill.id}
                  label={skillChipLabel(skill)}
                  active={selectedSkillIds.includes(skill.id)}
                  onPress={() => toggleSkill(skill.id)}
                  size="sm"
                />
              ))}
            </View>
          </View>
        )}

        <View style={styles.promoSection}>
          <View style={styles.promoInputRow}>
            <TextInput
              style={styles.promoInput}
              placeholder="Promo code"
              placeholderTextColor={colors.textPlaceholder}
              value={promoCode}
              onChangeText={setPromoCode}
              autoCapitalize="characters"
              editable={appliedPromo == null}
            />
            <TouchableOpacity
              onPress={handleApplyPromo}
              activeOpacity={0.7}
              disabled={appliedPromo != null || promoCode.trim().length === 0 || validatePromo.isPending}
            >
              <Text
                style={[
                  styles.promoApplyText,
                  (appliedPromo != null || promoCode.trim().length === 0 || validatePromo.isPending) &&
                    styles.promoApplyTextDisabled,
                ]}
              >
                Apply
              </Text>
            </TouchableOpacity>
          </View>
          {appliedPromo && (
            <View style={styles.promoChip}>
              <Text style={styles.promoChipText}>
                {appliedPromo.code} — {formatMoney(appliedPromo.discountAmount)} off
              </Text>
              <TouchableOpacity onPress={handleRemovePromo} activeOpacity={0.7}>
                <Ionicons name="close" size={16} color={colors.successDark} />
              </TouchableOpacity>
            </View>
          )}
          {validatePromo.isError && (
            <Text style={styles.promoErrorText}>
              {validatePromo.error.message || 'That promo code could not be applied.'}
            </Text>
          )}
        </View>

        {isPricingLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
        ) : (
          <View style={styles.priceCard}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>
                Base {hourlyRate != null ? formatMoney(hourlyRate, { fractionDigits: 0 }) : '—'} × {hours}h
              </Text>
              <Text style={styles.priceValue}>{formatMoney(baseCost)}</Text>
            </View>
            {breakdown?.skillAddOns.map((addon) => (
              <View style={styles.priceRow} key={addon.id}>
                <Text style={styles.addOnRowLabel}>+ {addon.name}</Text>
                <Text style={styles.addOnRowValue}>
                  +{formatMoney(addon.amountPerHour * hours)}
                </Text>
              </View>
            ))}
            {durationDiscount > 0.005 && (
              <View style={styles.priceRow}>
                <Text style={styles.promoLabel}>Longer-booking discount</Text>
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
          </View>
        )}

        <View style={styles.instructionsSection}>
          <Text style={styles.instructionsLabel}>Special instructions (optional)</Text>
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

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.proceedBtn, !canProceed && styles.proceedBtnDisabled]}
          onPress={handleProceed}
          activeOpacity={0.85}
          disabled={!canProceed}
        >
          <Text style={styles.proceedBtnText}>
            Request care · {formatMoney(total)}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
