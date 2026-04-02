import { ScrollView, View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card } from '@mobile/components';
import { colors, fontSizes, radii, shadows, spacing } from '@mobile/lib/theme';

const FAQS = [
  {
    q: 'How are nannies vetted?',
    a: 'All nannies complete a background check including identity verification, reference checks, and CPR certification.',
    expanded: true,
  },
  { q: 'What is the cancellation policy?', a: '', expanded: false },
  { q: 'How do refunds work?', a: '', expanded: false },
];

export default function SupportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Help & Support</Text>
      </View>

      {/* Live chat hero */}
      <View style={styles.chatHero}>
        <View style={styles.chatHeroContent}>
          <Text style={styles.chatEmoji}>💬</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.chatTitle}>Chat with us</Text>
            <Text style={styles.chatAvail}>● Available now · ~2 min wait</Text>
          </View>
          <Pressable style={styles.startChatBtn}>
            <Text style={styles.startChatText}>Start Chat</Text>
          </Pressable>
        </View>
      </View>

      {/* FAQ search */}
      <View style={styles.padH}>
        <TextInput
          placeholder="Search help articles..."
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
        />
      </View>

      {/* FAQ accordion */}
      <View style={[styles.padH, { marginTop: spacing.xl }]}>
        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
        {FAQS.map((faq, i) => (
          <Pressable key={i} style={styles.faqItem}>
            <View style={styles.faqHeader}>
              <Text style={styles.faqArrow}>{faq.expanded ? '▼' : '▶'}</Text>
              <Text style={styles.faqQuestion}>{faq.q}</Text>
            </View>
            {faq.expanded && faq.a ? (
              <Text style={styles.faqAnswer}>{faq.a}</Text>
            ) : null}
          </Pressable>
        ))}
      </View>

      {/* Other contact options */}
      <View style={[styles.padH, { marginTop: spacing['2xl'] }]}>
        <Text style={styles.sectionTitle}>Other ways to reach us</Text>

        <Card style={{ marginBottom: spacing.md }}>
          <View style={styles.contactRow}>
            <Text style={styles.contactIcon}>📧</Text>
            <View>
              <Text style={styles.contactTitle}>Email Support</Text>
              <Text style={styles.contactSub}>Reply within 24 hours</Text>
            </View>
          </View>
        </Card>

        <Card>
          <View style={styles.contactRow}>
            <Text style={styles.contactIcon}>👩‍👩‍👧</Text>
            <View>
              <Text style={styles.contactTitle}>Ask the Community</Text>
              <Text style={styles.contactSub}>Moms helping moms</Text>
            </View>
          </View>
        </Card>
      </View>

      {/* Emergency card */}
      <View style={[styles.padH, { marginTop: spacing['2xl'] }]}>
        <View style={styles.emergencyCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.emergencyTitle}>🆘 Emergency Assistance</Text>
            <Text style={styles.emergencyText}>24/7 safety hotline — we're always here</Text>
          </View>
          <Button title="📞 Call Now" variant="outline" color={colors.error} size="sm" />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg, gap: spacing.md,
  },
  backArrow: { fontSize: 24, color: colors.textPrimary },
  headerTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.textPrimary },

  chatHero: {
    marginHorizontal: spacing.lg, borderRadius: radii.lg, overflow: 'hidden',
    marginBottom: spacing.xl,
  },
  chatHeroContent: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.primary, padding: spacing.xl,
  },
  chatEmoji: { fontSize: 28 },
  chatTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.white },
  chatAvail: { fontSize: fontSizes.xs, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  startChatBtn: {
    backgroundColor: colors.white, borderRadius: radii['2xl'],
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  startChatText: { fontWeight: '700', fontSize: fontSizes.sm, color: colors.primary },

  padH: { paddingHorizontal: spacing.lg },
  searchInput: {
    backgroundColor: colors.surface, borderRadius: radii.lg,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    fontSize: fontSizes.base, color: colors.textPrimary,
  },

  sectionTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },

  faqItem: {
    borderBottomWidth: 1, borderBottomColor: colors.surface, paddingVertical: spacing.lg,
  },
  faqHeader: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  faqArrow: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  faqQuestion: { fontSize: fontSizes.base, fontWeight: '600', color: colors.textPrimary, flex: 1 },
  faqAnswer: {
    fontSize: fontSizes.sm, color: colors.textSecondary, lineHeight: 22,
    marginTop: spacing.sm, paddingLeft: spacing.xl,
  },

  contactRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  contactIcon: { fontSize: 24 },
  contactTitle: { fontSize: fontSizes.base, fontWeight: '700', color: colors.textPrimary },
  contactSub: { fontSize: fontSizes.sm, color: colors.textSecondary },

  emergencyCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: '#FEE2E2', borderRadius: radii.lg, padding: spacing.lg,
    borderLeftWidth: 4, borderLeftColor: colors.error,
  },
  emergencyTitle: { fontSize: fontSizes.base, fontWeight: '700', color: colors.error },
  emergencyText: { fontSize: fontSizes.sm, color: colors.textSecondary, marginTop: 2 },
});
