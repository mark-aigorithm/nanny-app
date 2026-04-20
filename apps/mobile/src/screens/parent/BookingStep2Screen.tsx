import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors, spacing } from '@mobile/theme';
import { MOCK_PAYMENT_METHODS } from '@mobile/mocks';
import { PAYMENT_TYPES } from '@mobile/constants';
import type { PaymentMethod } from '@mobile/types';
import { styles } from './styles/booking-step2-screen.styles';

function getCardIcon(type: PaymentMethod['type']): string {
  switch (type) {
    case 'visa': return 'card';
    case 'mastercard': return 'card';
    case 'amex': return 'card';
    case 'apple_pay': return 'logo-apple';
    case 'google_pay': return 'logo-google';
  }
}

export default function BookingStep2Screen() {
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
    total?: string;
  }>();
  const [selectedPaymentId, setSelectedPaymentId] = useState<string>(
    MOCK_PAYMENT_METHODS.find((m) => m.isDefault)?.id ?? MOCK_PAYMENT_METHODS[0].id,
  );
  const [showNewCardForm, setShowNewCardForm] = useState(false);

  const handleContinue = () => {
    const selected = MOCK_PAYMENT_METHODS.find((m) => m.id === selectedPaymentId);
    const paymentLabel = selected
      ? selected.type === 'apple_pay'
        ? 'Apple Pay'
        : `${PAYMENT_TYPES[selected.type]} ending in ${selected.last4}`
      : '';
    router.push({
      pathname: '/(parent)/book/booking-step-3',
      params: {
        nannyProfileId: params.nannyProfileId,
        date: params.date,
        startTime: params.startTime,
        endTime: params.endTime,
        dateIso: params.dateIso,
        startTimeIso: params.startTimeIso,
        endTimeIso: params.endTimeIso,
        nannyName: params.nannyName,
        nannyPhoto: params.nannyPhoto,
        nannyRate: params.nannyRate,
        total: params.total,
        paymentMethodId: selectedPaymentId,
        paymentLabel,
      },
    } as never);
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
          <Pressable style={styles.headerIconBtn}>
            <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      {/* Scrollable content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Progress */}
        <View style={styles.progressSection}>
          <View style={styles.dotsRow}>
            <View style={[styles.dot, styles.dotCompleted]} />
            <View style={[styles.dot, styles.dotActive]} />
            <View style={[styles.dot, styles.dotInactive]} />
          </View>
          <Text style={styles.stepLabel}>Step 2 of 3</Text>
          <Text style={styles.heading}>Payment method</Text>
        </View>

        {/* Saved Cards */}
        <View style={styles.savedCardsSection}>
          <Text style={styles.sectionLabel}>Saved cards</Text>
          {MOCK_PAYMENT_METHODS.filter((m) => m.type !== 'apple_pay' && m.type !== 'google_pay').map((method) => {
            const isSelected = selectedPaymentId === method.id;
            return (
              <Pressable
                key={method.id}
                style={[styles.cardRow, isSelected && styles.cardRowSelected]}
                onPress={() => setSelectedPaymentId(method.id)}
              >
                <View style={styles.cardIcon}>
                  <Ionicons name={getCardIcon(method.type) as never} size={20} color={colors.textTertiary} />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardLabel}>
                    {PAYMENT_TYPES[method.type]} ****{method.last4}
                  </Text>
                  <Text style={styles.cardExpiry}>
                    Expires {String(method.expiryMonth).padStart(2, '0')}/{method.expiryYear}
                  </Text>
                </View>
                {method.isDefault && (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultBadgeText}>DEFAULT</Text>
                  </View>
                )}
                <View style={[styles.radio, isSelected && styles.radioSelected]}>
                  {isSelected && <View style={styles.radioInner} />}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Digital Wallets */}
        <View>
          <Text style={styles.sectionLabel}>Digital wallets</Text>
          <View style={[styles.digitalWalletRow, { marginTop: spacing.md }]}>
            {MOCK_PAYMENT_METHODS.filter((m) => m.type === 'apple_pay' || m.type === 'google_pay').map((method) => (
              <Pressable
                key={method.id}
                style={[styles.walletButton, selectedPaymentId === method.id && styles.cardRowSelected]}
                onPress={() => setSelectedPaymentId(method.id)}
              >
                <Text style={styles.walletButtonText}>
                  <Ionicons name={getCardIcon(method.type) as never} size={16} /> {PAYMENT_TYPES[method.type]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Add new card */}
        <Pressable style={styles.addCardButton} onPress={() => setShowNewCardForm(!showNewCardForm)}>
          <Ionicons name="add" size={18} color={colors.primary} />
          <Text style={styles.addCardText}>Add new card</Text>
        </Pressable>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Pressable style={styles.proceedBtn} onPress={handleContinue}>
          <Text style={styles.proceedBtnText}>Continue to review</Text>
        </Pressable>
      </View>
    </View>
  );
}
