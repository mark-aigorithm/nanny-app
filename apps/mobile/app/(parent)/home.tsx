import { ScrollView, View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Badge, Card, NannyCard, SectionHeader } from '@mobile/components';
import { colors, fontSizes, radii, shadows, spacing } from '@mobile/lib/theme';

const PROMOS = [
  { id: '1', title: 'First Booking Free', subtitle: 'Use code FIRST20 for 20% off', bg: colors.primary },
  { id: '2', title: 'Refer a Friend', subtitle: 'Earn $25 credit per referral', bg: colors.communityPink },
  { id: '3', title: 'Summer Special', subtitle: 'Book 10hrs, get 1hr free', bg: colors.nannyGreen },
];

const NANNIES = [
  { id: '1', name: 'Elena Martinez', rating: 4.9, reviewCount: 127, hourlyRate: 28, distance: '0.8 mi' },
  { id: '2', name: 'Sarah Chen', rating: 4.8, reviewCount: 93, hourlyRate: 32, distance: '1.2 mi' },
  { id: '3', name: 'Amara Okafor', rating: 4.7, reviewCount: 68, hourlyRate: 25, distance: '1.5 mi' },
];

const FAVORITES = [
  { id: '1', name: 'Elena M.' },
  { id: '2', name: 'Sarah C.' },
  { id: '3', name: 'Priya K.' },
];

const QUICK_ACTIONS = [
  { id: 'book', icon: '📅', label: 'Book Now', color: colors.primary },
  { id: 'emergency', icon: '🆘', label: 'Emergency', color: colors.error },
  { id: 'forum', icon: '💬', label: 'Forum', color: colors.communityPink },
  { id: 'tracker', icon: '📍', label: 'Tracker', color: colors.careMint },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View>
          <Text style={styles.greeting}>Good morning, Sarah 👋</Text>
          <Text style={styles.subGreeting}>Let's find the perfect nanny</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable style={styles.bellWrapper}>
            <Text style={styles.bellIcon}>🔔</Text>
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>3</Text>
            </View>
          </Pressable>
          <Avatar name="Sarah Johnson" size={40} />
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <TextInput
          placeholder="Find a nanny..."
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
        />
      </View>

      {/* Promo carousel */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promoScroll}>
        {PROMOS.map((p) => (
          <Pressable key={p.id} style={[styles.promoCard, { backgroundColor: p.bg }]}>
            <Text style={styles.promoTitle}>{p.title}</Text>
            <Text style={styles.promoSub}>{p.subtitle}</Text>
            <View style={styles.promoCta}>
              <Text style={styles.promoCtaText}>Learn More</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      {/* Quick actions */}
      <View style={styles.quickGrid}>
        {QUICK_ACTIONS.map((a) => (
          <Pressable key={a.id} style={[styles.quickTile, { backgroundColor: a.color + '15' }]}>
            <Text style={styles.quickIcon}>{a.icon}</Text>
            <Text style={[styles.quickLabel, { color: a.color }]}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Recommended nearby */}
      <SectionHeader title="Recommended Nearby" actionLabel="See all" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nannyScroll}>
        {NANNIES.map((n) => (
          <NannyCard
            key={n.id}
            {...n}
            onPress={() => router.push('/(parent)/nanny-profile')}
          />
        ))}
      </ScrollView>

      {/* Favorites */}
      <SectionHeader title="Your Favorites" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.favScroll}>
        {FAVORITES.map((f) => (
          <View key={f.id} style={styles.favItem}>
            <Avatar name={f.name} size={56} />
            <Text style={styles.favName}>{f.name}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Community preview */}
      <View style={{ paddingHorizontal: spacing.lg }}>
        <Card>
          <Text style={styles.communityTitle}>Mom Community</Text>
          <Text style={styles.communitySnippet}>
            "Does anyone have a recommendation for a pediatric dentist in Park Slope?"
          </Text>
          <Pressable style={styles.joinBtn} onPress={() => router.push('/(parent)/community')}>
            <Text style={styles.joinText}>Join the Conversation</Text>
          </Pressable>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  greeting: { fontSize: fontSizes.xl, fontWeight: '700', color: colors.textPrimary },
  subGreeting: { fontSize: fontSizes.sm, color: colors.textSecondary, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bellWrapper: { position: 'relative', width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  bellIcon: { fontSize: 22 },
  bellBadge: {
    position: 'absolute', top: 2, right: 2,
    backgroundColor: colors.badgeRed, width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.white,
  },
  bellBadgeText: { color: colors.white, fontSize: 10, fontWeight: '700' },

  searchContainer: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  searchInput: {
    backgroundColor: colors.surface, borderRadius: radii.lg,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    fontSize: fontSizes.base, color: colors.textPrimary,
  },

  promoScroll: { paddingHorizontal: spacing.lg, marginBottom: spacing['2xl'] },
  promoCard: {
    width: 260, borderRadius: radii.lg, padding: spacing.xl, marginRight: spacing.md,
  },
  promoTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.white },
  promoSub: { fontSize: fontSizes.sm, color: 'rgba(255,255,255,0.85)', marginTop: spacing.xs },
  promoCta: {
    backgroundColor: colors.white, borderRadius: radii['2xl'],
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    alignSelf: 'flex-start', marginTop: spacing.md,
  },
  promoCtaText: { fontWeight: '700', fontSize: fontSizes.sm },

  quickGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: spacing.lg, gap: spacing.md, marginBottom: spacing['2xl'],
  },
  quickTile: {
    width: '47%', borderRadius: radii.lg, padding: spacing.xl,
    alignItems: 'center', justifyContent: 'center', minHeight: 90,
  },
  quickIcon: { fontSize: 32, marginBottom: spacing.sm },
  quickLabel: { fontSize: fontSizes.sm, fontWeight: '700' },

  nannyScroll: { paddingHorizontal: spacing.lg, marginBottom: spacing['2xl'] },
  favScroll: { paddingHorizontal: spacing.lg, marginBottom: spacing['2xl'] },
  favItem: { alignItems: 'center', marginRight: spacing.lg },
  favName: { fontSize: fontSizes.xs, color: colors.textSecondary, marginTop: spacing.xs },

  communityTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.textPrimary },
  communitySnippet: {
    fontSize: fontSizes.sm, color: colors.textSecondary,
    fontStyle: 'italic', marginTop: spacing.sm, marginBottom: spacing.md,
  },
  joinBtn: {
    backgroundColor: colors.communityPink, borderRadius: radii['2xl'],
    paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, alignSelf: 'flex-start',
  },
  joinText: { color: colors.white, fontWeight: '700', fontSize: fontSizes.sm },
});
