import React, { useState } from 'react';

import {

  View,

  Text,

  ScrollView,

  TouchableOpacity,

  TextInput,

  Image,

  ActivityIndicator,

} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { useRouter, useLocalSearchParams } from 'expo-router';



import { colors, spacing, borderRadius } from '@mobile/theme';

import { Card } from '@mobile/components/ui';

import {

  SHOW_PROMO_CODE,

  PROMO_CODE_VALUE,

  PROMO_DISCOUNT_PERCENT,

  PLATFORM_FEE_PERCENT,

  APP_NAME,

} from '@mobile/constants';

import { useNannyPublicProfile } from '@mobile/hooks/useNannies';

import { formatMoney } from '@mobile/lib/formatMoney';

import {

  getBookingDateDisplay,

  getBookingDurationHours,

  getBookingTimeDisplay,

  hasRequiredBookingDraft,

  resolveNannyPhoto,
  resolveNannyRate,

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

  const [promoApplied, setPromoApplied] = useState(false);

  const [instructions, setInstructions] = useState('');



  const draftReady = hasRequiredBookingDraft(params);

  const { data: nanny, isLoading: isNannyLoading } = useNannyPublicProfile(

    draftReady ? params.nannyProfileId : undefined,

  );



  const dateDisplay = getBookingDateDisplay(params);

  const timeDisplay = getBookingTimeDisplay(params);

  const hours = getBookingDurationHours(params);

  const nannyName =

    params.nannyName?.trim() ||

    (nanny ? `${nanny.firstName} ${nanny.lastName}`.trim() : '');

  const nannyPhoto = resolveNannyPhoto(params, nanny?.avatarUrl);

  const nannyRate = resolveNannyRate(params, nanny?.hourlyRate);



  const baseCost = nannyRate != null ? nannyRate * hours : 0;

  const promoDiscount =

    SHOW_PROMO_CODE && promoApplied ? baseCost * PROMO_DISCOUNT_PERCENT : 0;

  const subtotalAfterPromo = baseCost - promoDiscount;

  const fee = subtotalAfterPromo * PLATFORM_FEE_PERCENT;

  const total = subtotalAfterPromo + fee;



  const canProceed = draftReady && nannyRate != null && hours > 0 && !isNannyLoading;



  const handleApplyPromo = () => {

    if (promoCode.toUpperCase() === PROMO_CODE_VALUE) {

      setPromoApplied(true);

    }

  };



  const handleRemovePromo = () => {

    setPromoApplied(false);

    setPromoCode('');

  };



  const handleProceed = () => {

    if (!canProceed || nannyRate == null) return;

    router.push({

      pathname: '/(parent)/book/booking-step-3',

      params: {

        nannyProfileId: params.nannyProfileId,

        date: dateDisplay,

        dateIso: params.dateIso,

        startTimeIso: params.startTimeIso,

        endTimeIso: params.endTimeIso,

        nannyName,

        ...(nannyPhoto ? { nannyPhoto } : {}),

        nannyRate: String(nannyRate),

        total: total.toFixed(2),

        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),

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

        <BookingStepProgress step={2} title="Booking summary" centered />



        <Card shadow="sm" padding={spacing.lg} radius={borderRadius.xl}>

          <View style={styles.nannyCardInner}>

            {nannyPhoto ? (

              <Image source={{ uri: nannyPhoto }} style={styles.nannyPhoto} />

            ) : (

              <View style={[styles.nannyPhoto, styles.nannyPhotoPlaceholder]}>

                <Ionicons name="person" size={24} color={colors.textMuted} />

              </View>

            )}

            <View style={styles.nannyInfo}>

              <View style={styles.nannyNameRow}>

                <Text style={styles.nannyName}>{nannyName || 'Nanny'}</Text>

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



        {SHOW_PROMO_CODE && (

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

        )}



        {isNannyLoading ? (

          <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />

        ) : (

          <View style={styles.priceCard}>

            <View style={styles.priceRow}>

              <Text style={styles.priceLabel}>

                Base {nannyRate != null ? formatMoney(nannyRate, { fractionDigits: 0 }) : '—'} × {hours}h

              </Text>

              <Text style={styles.priceValue}>{formatMoney(baseCost)}</Text>

            </View>

            {SHOW_PROMO_CODE && promoApplied && (

              <View style={styles.priceRow}>

                <Text style={styles.promoLabel}>Promo</Text>

                <Text style={styles.promoValue}>–{formatMoney(promoDiscount)}</Text>

              </View>

            )}

            <View style={styles.priceRow}>

              <Text style={styles.priceLabel}>Fee 6%</Text>

              <Text style={styles.priceValue}>{formatMoney(fee)}</Text>

            </View>

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

          <Ionicons name="shield-checkmark" size={20} color={colors.success} />

          <Text style={styles.guaranteeText}>

            If {nannyName || 'your nanny'} cancels within 24hrs, we find a replacement automatically

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

            Proceed to payment · {formatMoney(total)}

          </Text>

        </TouchableOpacity>

      </View>

    </View>

  );

}


