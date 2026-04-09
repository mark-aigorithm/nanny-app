import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

// TODO: Replace with useBookingSummary() React Query hook

// ASSUMPTION: Nanny photo will come from GET /nannies/:id response.
// Using placeholder until the backend service is ready.
const IMG_NANNY = 'https://www.figma.com/api/mcp/asset/b036d9b4-1369-46b2-a2ab-7bf10277dba5';

// ASSUMPTION: Pricing data will come from GET /bookings/estimate endpoint.
// Using hardcoded mock values until the backend service is ready.
const MOCK_NANNY = {
  name: 'Elena Martinez',
  rating: 4.9,
  hourlyRate: 28,
  image: IMG_NANNY,
};

const PROMO_CODE_VALUE = 'FIRST20';
const PROMO_DISCOUNT_PERCENT = 0.2;
const PLATFORM_FEE_PERCENT = 0.06;

export default function BookingStep1Screen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    nannyId: string;
    date: string;
    startTime: string;
    endTime: string;
  }>();

  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);

  // ASSUMPTION: Date/time parsing will use a shared date utility from @nanny-app/shared.
  // Hardcoding display string until params are wired from the date picker screen.
  const dateDisplay = params.date || 'Sat Apr 12';
  const timeDisplay = `${params.startTime || '9AM'}–${params.endTime || '5PM'}`;
  const hours = 8;

  // Price calculations
  const baseCost = MOCK_NANNY.hourlyRate * hours;
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
    // ASSUMPTION: Navigation target will be booking-step-2 once payment screen is created.
    console.log('Proceeding to payment', { total: total.toFixed(2) });
    // router.push('/(parent)/book/booking-step-2');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color="#292524" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>NannyMom</Text>
          <TouchableOpacity style={styles.headerIconBtn} activeOpacity={0.7}>
            <Ionicons name="settings-outline" size={22} color="#292524" />
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
        <View style={styles.nannyCard}>
          <Image source={{ uri: MOCK_NANNY.image }} style={styles.nannyPhoto} />
          <View style={styles.nannyInfo}>
            <View style={styles.nannyNameRow}>
              <Text style={styles.nannyName}>{MOCK_NANNY.name}</Text>
              <Ionicons name="star" size={13} color="#f5a623" />
              <Text style={styles.nannyRating}>{MOCK_NANNY.rating}</Text>
            </View>
            <View style={styles.nannyDateRow}>
              <Ionicons name="calendar-outline" size={14} color="#444842" />
              <Text style={styles.nannyDateText}>
                {dateDisplay} · {timeDisplay} · {hours} hours
              </Text>
            </View>
          </View>
        </View>

        {/* Promo Section */}
        <View style={styles.promoSection}>
          <View style={styles.promoInputRow}>
            <TextInput
              style={styles.promoInput}
              placeholder="Promo code"
              placeholderTextColor="#a09890"
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
                <Ionicons name="close" size={16} color="#3d6b3d" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Price Card */}
        <View style={styles.priceCard}>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>
              Base ${MOCK_NANNY.hourlyRate}×{hours}
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
          <Ionicons name="shield-checkmark" size={20} color="#6a9b6a" />
          <Text style={styles.guaranteeText}>
            If Elena cancels within 24hrs, we find a replacement automatically
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

// ─── Layout constants ─────────────────────────────────────────────────────────

const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;
const HEADER_HEIGHT = STATUS_BAR_HEIGHT + 64;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcf9f7',
  },

  // Header
  header: {
    backgroundColor: '#fdfaf8',
    paddingTop: STATUS_BAR_HEIGHT,
    zIndex: 100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    height: 64,
  },
  headerIconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Manrope',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: -0.45,
    color: '#292524',
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 120,
    gap: 24,
  },

  // Progress & Title
  progressSection: {
    gap: 8,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  dot: {
    borderRadius: 9999,
  },
  dotActive: {
    width: 10,
    height: 10,
    backgroundColor: '#97a591',
  },
  dotInactive: {
    width: 8,
    height: 8,
    backgroundColor: '#e3d5ca',
  },
  stepLabel: {
    fontFamily: 'Manrope',
    fontWeight: '500',
    fontSize: 13,
    color: '#444842',
  },
  heading: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 20,
    letterSpacing: -0.5,
    color: '#1b1c1b',
  },

  // Nanny Card
  nannyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  nannyPhoto: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#e5e2e0',
  },
  nannyInfo: {
    flex: 1,
    gap: 6,
  },
  nannyNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nannyName: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 16,
    color: '#1b1c1b',
  },
  nannyRating: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 13,
    color: '#715b3a',
  },
  nannyDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nannyDateText: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 14,
    color: '#444842',
  },

  // Promo Section
  promoSection: {
    gap: 12,
  },
  promoInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(235,221,210,0.5)',
    borderRadius: 16,
    height: 44,
    paddingHorizontal: 16,
  },
  promoInput: {
    flex: 1,
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 14,
    color: '#1b1c1b',
    height: 44,
  },
  promoApplyText: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 14,
    color: '#97a591',
  },
  promoApplyTextDisabled: {
    opacity: 0.5,
  },
  promoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#d4e8d4',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  promoChipText: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 13,
    color: '#3d6b3d',
  },

  // Price Card
  priceCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ebddd2',
    borderRadius: 16,
    padding: 21,
    gap: 14,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceLabel: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 14,
    color: '#444842',
  },
  priceValue: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 14,
    color: '#1b1c1b',
  },
  promoLabel: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 14,
    color: '#6a9b6a',
  },
  promoValue: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 14,
    color: '#6a9b6a',
  },
  priceDivider: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(235,221,210,0.5)',
  },
  totalLabel: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 20,
    color: '#1b1c1b',
  },
  totalValue: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 20,
    color: '#97a591',
  },

  // Guarantee Card
  guaranteeCard: {
    backgroundColor: 'rgba(235,221,210,0.5)',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  guaranteeText: {
    flex: 1,
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 14,
    lineHeight: 20,
    color: '#6b6158',
  },

  // Sticky Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(253,250,248,0.8)',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  proceedBtn: {
    backgroundColor: '#97a591',
    borderRadius: 24,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proceedBtnText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 16,
    color: '#ffffff',
  },
});
