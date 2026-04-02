import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Badge, Button, Card } from '@mobile/components';
import { colors, fontSizes, radii, shadows, spacing } from '@mobile/lib/theme';

const CERTS = [
  { label: 'First Aid', color: '#22C55E' },
  { label: 'CPR', color: '#22C55E' },
  { label: 'Background Check', color: '#137FEC' },
  { label: 'ECE Degree', color: '#8B5CF6' },
];

const REVIEWS = [
  { id: '1', name: 'Amanda L.', date: 'Mar 2025', type: 'Date Night', stars: 5, text: 'Elena was amazing with our twins. They were asleep within 30 minutes! Will book again.' },
  { id: '2', name: 'Rachel K.', date: 'Feb 2025', type: 'Full Day', stars: 5, text: 'Super reliable and so good with our toddler. Highly recommend!' },
];

export default function NannyProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Hero placeholder */}
        <View style={styles.hero}>
          <View style={[styles.heroNav, { top: insets.top + spacing.sm }]}>
            <Pressable onPress={() => router.back()} style={styles.heroBtn}>
              <Text style={styles.heroBtnText}>←</Text>
            </Pressable>
            <View style={styles.heroActions}>
              <Pressable style={styles.heroBtn}><Text style={styles.heroBtnText}>♡</Text></Pressable>
              <Pressable style={styles.heroBtn}><Text style={styles.heroBtnText}>↗</Text></Pressable>
            </View>
          </View>
          <Avatar name="Elena Martinez" size={120} />
        </View>

        {/* Summary card */}
        <View style={styles.summaryCard}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>Elena Martinez</Text>
            <Text style={styles.verified}>🛡️</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.rate}>$28/hr</Text>
            <Text style={styles.rating}>⭐ 4.9 (127 reviews)</Text>
          </View>
          <Text style={styles.location}>📍 Brooklyn, NY</Text>

          {/* Stats */}
          <View style={styles.statsRow}>
            <Badge label="8 yrs exp" bgColor={colors.surface} color={colors.textPrimary} />
            <Badge label="Age 29" bgColor={colors.surface} color={colors.textPrimary} />
            <Badge label="Ages 0-5" bgColor={colors.surface} color={colors.textPrimary} />
          </View>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <Button title="💬  Message" variant="outline" size="sm" />
            <Button title="📅  Availability" variant="outline" size="sm" />
          </View>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About Me</Text>
          <Text style={styles.aboutText}>
            Hi! I'm Elena, a passionate childcare professional with 8 years of experience caring for children ages 0-5. I hold a degree in Early Childhood Education and love creating fun, educational activities. I'm CPR certified and believe every child deserves a safe, nurturing environment.
          </Text>
        </View>

        {/* Certifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Certifications</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {CERTS.map((c) => (
              <View key={c.label} style={[styles.certCard, { borderColor: c.color }]}>
                <Text style={[styles.certCheck, { color: c.color }]}>✓</Text>
                <Text style={styles.certLabel}>{c.label}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Trust bar */}
        <View style={styles.section}>
          <Card>
            <View style={styles.trustRow}>
              <View style={styles.trustAvatars}>
                <Avatar name="A" size={28} />
                <Avatar name="B" size={28} />
                <Avatar name="C" size={28} />
              </View>
              <Text style={styles.trustText}>3 of your connections hired Elena</Text>
            </View>
          </Card>
        </View>

        {/* Reviews */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reviews</Text>
          {REVIEWS.map((r) => (
            <Card key={r.id} style={{ marginBottom: spacing.md }}>
              <View style={styles.reviewHeader}>
                <Avatar name={r.name} size={36} />
                <View style={styles.reviewMeta}>
                  <Text style={styles.reviewName}>{r.name}</Text>
                  <Text style={styles.reviewDate}>{r.date} · {r.type}</Text>
                </View>
                <Text style={styles.reviewStars}>{'⭐'.repeat(r.stars)}</Text>
              </View>
              <Text style={styles.reviewText}>{r.text}</Text>
            </Card>
          ))}
        </View>
      </ScrollView>

      {/* Sticky footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button
          title="Book Elena — $28/hr"
          fullWidth
          size="lg"
          onPress={() => router.push('/(parent)/booking')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hero: {
    height: 280, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'flex-end', paddingBottom: spacing['2xl'],
  },
  heroNav: {
    position: 'absolute', left: spacing.lg, right: spacing.lg,
    flexDirection: 'row', justifyContent: 'space-between', zIndex: 10,
  },
  heroActions: { flexDirection: 'row', gap: spacing.sm },
  heroBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroBtnText: { fontSize: 18 },

  summaryCard: {
    backgroundColor: colors.white, borderRadius: radii.lg,
    marginTop: -24, marginHorizontal: spacing.lg, padding: spacing.xl,
    ...shadows.md,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { fontSize: fontSizes['2xl'], fontWeight: '700', color: colors.textPrimary },
  verified: { fontSize: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.sm },
  rate: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.primary },
  rating: { fontSize: fontSizes.sm, color: colors.textSecondary },
  location: { fontSize: fontSizes.sm, color: colors.textSecondary, marginTop: spacing.xs },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  actionRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },

  section: { paddingHorizontal: spacing.lg, marginTop: spacing['2xl'] },
  sectionTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  aboutText: { fontSize: fontSizes.base, color: colors.textSecondary, lineHeight: 24 },

  certCard: {
    borderWidth: 1.5, borderRadius: radii.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    marginRight: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  certCheck: { fontSize: 16, fontWeight: '700' },
  certLabel: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.textPrimary },

  trustRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  trustAvatars: { flexDirection: 'row', marginLeft: -4 },
  trustText: { fontSize: fontSizes.sm, color: colors.textSecondary, flex: 1 },

  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  reviewMeta: { flex: 1 },
  reviewName: { fontSize: fontSizes.sm, fontWeight: '700', color: colors.textPrimary },
  reviewDate: { fontSize: fontSizes.xs, color: colors.textMuted },
  reviewStars: { fontSize: 10 },
  reviewText: { fontSize: fontSizes.sm, color: colors.textSecondary, lineHeight: 20 },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.white, paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
});
