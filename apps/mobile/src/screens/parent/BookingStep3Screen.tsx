import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@mobile/theme';
import { MOCK_NANNY_BOOKING } from '@mobile/mocks';
import { PLATFORM_FEE_PERCENT } from '@mobile/constants';
import { useCreateBooking, useMockPay, DEMO_PAY_BODY } from '@mobile/hooks/useBookings';
import { styles } from './styles/booking-step3-screen.styles';

export default function BookingStep3Screen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    nannyProfileId?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    dateIso?: string;
    startTimeIso?: string;
    endTimeIso?: string;
    nannyName?: string;
    nannyPhoto?: string;
    nannyRate?: string;
    paymentLabel?: string;
  }>();

  const [specialInstructions, setSpecialInstructions] = useState('');
  const createBooking = useCreateBooking();
  const mockPay = useMockPay();

  const nannyName = params.nannyName ?? MOCK_NANNY_BOOKING.name;
  const nannyPhoto = params.nannyPhoto ?? MOCK_NANNY_BOOKING.image;
  const nannyRate = params.nannyRate ? Number(params.nannyRate) : 28;

  const dateDisplay = params.date ?? 'Sat Apr 12';
  const timeDisplay = `${params.startTime ?? '9AM'} - ${params.endTime ?? '5PM'}`;
  const hours = params.startTimeIso && params.endTimeIso
    ? Math.round((new Date(params.endTimeIso).getTime() - new Date(params.startTimeIso).getTime()) / 3_600_000)
    : 8;
  const baseCost = nannyRate * hours;
  const fee = baseCost * PLATFORM_FEE_PERCENT;
  const total = baseCost + fee;

  const isSubmitting = createBooking.isPending || mockPay.isPending;

  const handleConfirm = async () => {
    if (!params.nannyProfileId || !params.dateIso || !params.startTimeIso || !params.endTimeIso) {
      Alert.alert('Error', 'Missing booking details. Please go back and try again.');
      return;
    }
    try {
      const booking = await createBooking.mutateAsync({
        nannyProfileId: params.nannyProfileId,
        date: params.dateIso,
        startTime: params.startTimeIso,
        endTime: params.endTimeIso,
      });
      await mockPay.mutateAsync({ id: booking.id, body: DEMO_PAY_BODY });
      router.push({
        pathname: '/(parent)/book/booking-confirmation',
        params: { bookingId: booking.id },
      } as never);
    } catch (err) {
      Alert.alert('Booking failed', err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable style={styles.headerIconBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>NannyMom</Text>
          <View style={styles.headerIconBtn} />
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Progress */}
        <View style={styles.progressSection}>
          <View style={styles.dotsRow}>
            <View style={[styles.dot, styles.dotCompleted]} />
            <View style={[styles.dot, styles.dotCompleted]} />
            <View style={[styles.dot, styles.dotActive]} />
          </View>
          <Text style={styles.stepLabel}>Step 3 of 3</Text>
          <Text style={styles.heading}>Review & confirm</Text>
        </View>

        {/* Nanny Card */}
        <View style={styles.nannyCard}>
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

        {/* Price Card */}
        <View style={styles.priceCard}>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Base ${nannyRate} x {hours}</Text>
            <Text style={styles.priceValue}>${baseCost.toFixed(2)}</Text>
          </View>
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

        {/* Payment Method */}
        <View style={styles.paymentMethodCard}>
          <View style={styles.paymentIconCircle}>
            <Ionicons name="card-outline" size={20} color={colors.textTertiary} />
          </View>
          <Text style={styles.paymentLabel}>
            {params.paymentLabel ?? 'Visa ending in 4242'}
          </Text>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.changeText}>Change</Text>
          </Pressable>
        </View>

        {/* Special Instructions */}
        <View style={styles.instructionsSection}>
          <Text style={styles.instructionsLabel}>Special instructions (optional)</Text>
          <TextInput
            style={styles.instructionsInput}
            placeholder="Any notes for the nanny..."
            placeholderTextColor={colors.textPlaceholder}
            value={specialInstructions}
            onChangeText={setSpecialInstructions}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* Guarantee */}
        <View style={styles.guaranteeCard}>
          <Ionicons name="shield-checkmark" size={20} color={colors.success} />
          <Text style={styles.guaranteeText}>
            Free cancellation up to 24 hours before booking. If the nanny cancels, we find a replacement automatically.
          </Text>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Pressable style={styles.confirmBtn} onPress={handleConfirm} disabled={isSubmitting}>
          {isSubmitting
            ? <ActivityIndicator color={colors.white} />
            : <Text style={styles.confirmBtnText}>Confirm booking · ${total.toFixed(2)}</Text>
          }
        </Pressable>
      </View>
    </View>
  );
}
