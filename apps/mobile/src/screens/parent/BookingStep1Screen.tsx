import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { colors, spacing, borderRadius } from '@mobile/theme';
import { Card } from '@mobile/components/ui';
import { MOCK_NANNY_BOOKING } from '@mobile/mocks';
import { PROMO_CODE_VALUE, PROMO_DISCOUNT_PERCENT, PLATFORM_FEE_PERCENT } from '@mobile/constants';
import { styles } from './styles/booking-step1-screen.styles';

// TODO: Replace with useBookingSummary() React Query hook

export default function BookingStep1Screen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    nannyProfileId: string;
    date: string;
    startTime: string;
    endTime: string;
    dateIso: string;
    startTimeIso: string;
    endTimeIso: string;
    nannyName?: string;
    nannyPhoto?: string;
    nannyRate?: string;
  }>();

  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);

  const dateDisplay = params.date || 'Sat Apr 12';
  const timeDisplay = `${params.startTime || '9AM'}–${params.endTime || '5PM'}`;

  const nannyName = params.nannyName ?? MOCK_NANNY_BOOKING.name;
  const nannyPhoto = params.nannyPhoto ?? MOCK_NANNY_BOOKING.image;
  const nannyRate = params.nannyRate ? Number(params.nannyRate) : MOCK_NANNY_BOOKING.hourlyRate;

  // Estimate hours from ISO times if available, fallback to 8
  const hours = params.startTimeIso && params.endTimeIso
    ? Math.round((new Date(params.endTimeIso).getTime() - new Date(params.startTimeIso).getTime()) / 3_600_000)
    : 8;

  // Price calculations
  const baseCost = nannyRate * hours;
  const promoDiscount = promoApplied ? baseCost * PROMO_DISCOUNT_PERCENT : 0;
  const subtotalAfterPromo = baseCost - promoDiscount;
  const fee = subtotalAfterPromo * PLATFORM_FEE_PERCENT;
  const total = subtotalAfterPromo + fee;

  const handleApplyPromo = () => {
    // ASSUMPTION: Promo validation will be handled by POST /promo/validate endpoint.
    if (promoCode.toUpperCase() === PROMO_CODE_VALUE) {
      setPromoApplied(true);
    }
  };

  const handleRemovePromo = () => {
    setPromoApplied(false);
    setPromoCode('');
  };

  const handleProceed = () => {
    router.push({
      pathname: '/(parent)/book/booking-step-2',
      params: {
        nannyProfileId: params.nannyProfileId,
        date: dateDisplay,
        startTime: timeDisplay.split('–')[0],
        endTime: timeDisplay.split('–')[1],
        dateIso: params.dateIso,
        startTimeIso: params.startTimeIso,
        endTimeIso: params.endTimeIso,
        nannyName,
        nannyPhoto,
        nannyRate: String(nannyRate),
        total: total.toFixed(2),
      },
    } as never);
  };

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>NannyMom</Text>
          <TouchableOpacity style={styles.headerIconBtn} activeOpacity={0.7}>
            <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Scrollable content ── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Progress & Title */}
        <View style={styles.progressSection}>
          <View style={styles.dotsRow}>
            <View style={[styles.dot, styles.dotActive]} />
            <View style={[styles.dot, styles.dotInactive]} />
            <View style={[styles.dot, styles.dotInactive]} />
          </View>
          <Text style={styles.stepLabel}>Step 1 of 3</Text>
          <Text style={styles.heading}>Booking summary</Text>
        </View>

        {/* Nanny Card */}
        <Card shadow="sm" padding={spacing.lg} radius={borderRadius.xl}>
          <View style={styles.nannyCardInner}>
            <Image source={{ uri: nannyPhoto }} style={styles.nannyPhoto} />
            <View style={styles.nannyInfo}>
              <View style={styles.nannyNameRow}>
                <Text style={styles.nannyName}>{nannyName}</Text>
                <Ionicons name="star" size={13} color={colors.gold} />
              </View>
              <View style={styles.nannyDateRow}>
                <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.nannyDateText}>
                  {dateDisplay} · {timeDisplay} · {hours} hours
                </Text>
              </View>
            </View>
          </View>
        </Card>

        {/* Promo Section */}
        <View style={styles.promoSection}>
          <View style={styles.promoInputRow}>
            <TextInput
              style={styles.promoInput}
              placeholder="Promo code"
              placeholderTextColor={colors.textPlaceholder}
              value={promoCode}
              onChangeText={setPromoCode}
              autoCapitalize="characters"
              editable={!promoApplied}
            />
            <TouchableOpacity
              onPress={handleApplyPromo}
              activeOpacity={0.7}
              disabled={promoApplied || promoCode.length === 0}
            >
              <Text
                style={[
                  styles.promoApplyText,
                  (promoApplied || promoCode.length === 0) && styles.promoApplyTextDisabled,
                ]}
              >
                Apply
              </Text>
            </TouchableOpacity>
          </View>
          {promoApplied && (
            <View style={styles.promoChip}>
              <Text style={styles.promoChipText}>FIRST20 — 20% off</Text>
              <TouchableOpacity onPress={handleRemovePromo} activeOpacity={0.7}>
                <Ionicons name="close" size={16} color={colors.successDark} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Price Card */}
        <View style={styles.priceCard}>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>
              Base ${nannyRate}×{hours}
            </Text>
            <Text style={styles.priceValue}>${baseCost.toFixed(2)}</Text>
          </View>
          {promoApplied && (
            <View style={styles.priceRow}>
              <Text style={styles.promoLabel}>Promo</Text>
              <Text style={styles.promoValue}>–${promoDiscount.toFixed(2)}</Text>
            </View>
          )}
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Fee 6%</Text>
            <Text style={styles.priceValue}>${fee.toFixed(2)}</Text>
          </View>
          <View style={styles.priceDivider} />
          <View style={styles.priceRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
          </View>
        </View>

        {/* Guarantee Card */}
        <View style={styles.guaranteeCard}>
          <Ionicons name="shield-checkmark" size={20} color={colors.success} />
          <Text style={styles.guaranteeText}>
            If {nannyName} cancels within 24hrs, we find a replacement automatically
          </Text>
        </View>
      </ScrollView>

      {/* ── Sticky Footer ── */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.proceedBtn}
          onPress={handleProceed}
          activeOpacity={0.85}
        >
          <Text style={styles.proceedBtnText}>
            Proceed to payment · ${total.toFixed(2)}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

