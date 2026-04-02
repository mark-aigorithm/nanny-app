import { ScrollView, View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Badge, Button, Card } from '@mobile/components';
import { colors, fontSizes, radii, shadows, spacing } from '@mobile/lib/theme';

export default function BookingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Booking Summary</Text>
          {/* Step indicator */}
          <View style={styles.steps}>
            <View style={[styles.stepDot, styles.stepActive]} />
            <View style={styles.stepDot} />
            <View style={styles.stepDot} />
          </View>
        </View>

        {/* Nanny summary */}
        <View style={styles.padH}>
          <Card>
            <View style={styles.nannyRow}>
              <Avatar name="Elena Martinez" size={52} />
              <View style={styles.nannyInfo}>
                <Text style={styles.nannyName}>Elena Martinez</Text>
                <Text style={styles.nannyRating}>⭐ 4.9</Text>
                <Text style={styles.bookingDate}>Sat Apr 12 · 9:00 AM – 5:00 PM · 8 hrs</Text>
              </View>
            </View>
          </Card>
        </View>

        {/* Promo code */}
        <View style={[styles.padH, { marginTop: spacing.xl }]}>
          <Text style={styles.label}>Promo Code</Text>
          <View style={styles.promoRow}>
            <TextInput placeholder="Enter code" style={styles.promoInput} placeholderTextColor={colors.textMuted} />
            <Pressable style={styles.applyBtn}>
              <Text style={styles.applyText}>Apply</Text>
            </Pressable>
          </View>
          {/* Applied chip */}
          <View style={styles.appliedChip}>
            <Text style={styles.appliedText}>FIRST20 — 20% off</Text>
            <Pressable hitSlop={8}><Text style={styles.appliedX}>✕</Text></Pressable>
          </View>
        </View>

        {/* Price breakdown */}
        <View style={[styles.padH, { marginTop: spacing.xl }]}>
          <Card>
            <Text style={styles.priceTitle}>Price Breakdown</Text>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Base rate ($28 × 8 hrs)</Text>
              <Text style={styles.priceValue}>$224.00</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Promo discount</Text>
              <Text style={[styles.priceValue, { color: colors.success }]}>–$44.80</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Service fee (6%)</Text>
              <Text style={styles.priceValue}>$10.75</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.priceRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>$189.95</Text>
            </View>
          </Card>
        </View>

        {/* Guarantee */}
        <View style={[styles.padH, { marginTop: spacing.xl }]}>
          <Card style={{ backgroundColor: colors.primary + '08' }}>
            <View style={styles.guaranteeRow}>
              <Text style={styles.guaranteeIcon}>🛡️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.guaranteeTitle}>Reliability Guarantee</Text>
                <Text style={styles.guaranteeText}>
                  If Elena cancels within 24hrs, we find a replacement automatically
                </Text>
              </View>
            </View>
          </Card>
        </View>
      </ScrollView>

      {/* Sticky footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button title="Proceed to Payment → $189.95" fullWidth size="lg" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg, gap: spacing.md,
  },
  backArrow: { fontSize: 24, color: colors.textPrimary },
  headerTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  steps: { flexDirection: 'row', gap: spacing.sm },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  stepActive: { backgroundColor: colors.primary, width: 24 },

  padH: { paddingHorizontal: spacing.lg },
  nannyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nannyInfo: { flex: 1 },
  nannyName: { fontSize: fontSizes.base, fontWeight: '700', color: colors.textPrimary },
  nannyRating: { fontSize: fontSizes.sm, color: colors.textSecondary },
  bookingDate: { fontSize: fontSizes.sm, color: colors.textSecondary, marginTop: 2 },

  label: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.sm },
  promoRow: { flexDirection: 'row', gap: spacing.sm },
  promoInput: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    fontSize: fontSizes.base, color: colors.textPrimary,
  },
  applyBtn: {
    backgroundColor: colors.primary, borderRadius: radii.md,
    paddingHorizontal: spacing.xl, justifyContent: 'center',
  },
  applyText: { color: colors.white, fontWeight: '700', fontSize: fontSizes.sm },
  appliedChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#22C55E18', borderRadius: radii.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    alignSelf: 'flex-start', marginTop: spacing.sm,
  },
  appliedText: { fontSize: fontSizes.sm, color: colors.success, fontWeight: '600' },
  appliedX: { fontSize: 14, color: colors.success },

  priceTitle: { fontSize: fontSizes.base, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  priceLabel: { fontSize: fontSizes.sm, color: colors.textSecondary },
  priceValue: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.textPrimary },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  totalLabel: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.textPrimary },
  totalValue: { fontSize: fontSizes.xl, fontWeight: '700', color: colors.primary },

  guaranteeRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  guaranteeIcon: { fontSize: 28 },
  guaranteeTitle: { fontSize: fontSizes.base, fontWeight: '700', color: colors.textPrimary },
  guaranteeText: { fontSize: fontSizes.sm, color: colors.textSecondary, marginTop: 2, lineHeight: 20 },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.white, paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
});
