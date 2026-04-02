import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Chip, Fab } from '@mobile/components';
import { colors, fontSizes, radii, spacing } from '@mobile/lib/theme';

const FILTERS = ['All', 'Health', 'Play', 'Meals', 'Sleep'];

const ACTIVITIES = [
  {
    id: '1', type: 'meal', icon: '🍼', color: colors.activityMeal,
    title: 'Feeding', time: '1:30 PM',
    text: 'Elena fed Liam 6 oz of formula. He finished the whole bottle! 🍼',
    unread: true,
  },
  {
    id: '2', type: 'nap', icon: '💤', color: colors.activityNap,
    title: 'Nap', time: '12:00 PM',
    text: 'Liam fell asleep in his crib. Playing soft music.',
    unread: false,
  },
  {
    id: '3', type: 'diaper', icon: '🌿', color: colors.activityDiaper,
    title: 'Diaper Change', time: '11:15 AM',
    text: 'Wet diaper changed. All good! 😊',
    unread: false,
  },
];

export default function CareFeedScreen() {
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
          <Text style={styles.headerTitle}>Liam's Care Feed</Text>
          <Text style={styles.filterIcon}>⚙️</Text>
        </View>

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTERS.map((f, i) => (
            <Chip key={f} label={f} active={i === 0} />
          ))}
        </ScrollView>

        {/* Date group */}
        <View style={styles.dateRow}>
          <Text style={styles.dateLabel}>Today, Apr 12</Text>
          <Pressable hitSlop={8}><Text style={styles.markRead}>Mark all as read</Text></Pressable>
        </View>

        {/* Activity cards */}
        {ACTIVITIES.map((a) => (
          <View key={a.id} style={styles.cardWrapper}>
            <Card>
              <View style={styles.activityRow}>
                {a.unread && <View style={styles.unreadDot} />}
                <View style={[styles.iconCircle, { backgroundColor: a.color + '25' }]}>
                  <Text style={styles.activityIcon}>{a.icon}</Text>
                </View>
                <View style={styles.activityInfo}>
                  <View style={styles.activityHeader}>
                    <Text style={styles.activityTitle}>{a.title}</Text>
                    <Text style={styles.activityTime}>{a.time}</Text>
                  </View>
                  <Text style={styles.activityText}>{a.text}</Text>
                </View>
              </View>
            </Card>
          </View>
        ))}

        {/* Yesterday */}
        <Text style={[styles.dateLabel, { paddingHorizontal: spacing.lg, marginTop: spacing['2xl'] }]}>Yesterday, Apr 11</Text>
        <View style={styles.cardWrapper}>
          <Card style={{ opacity: 0.6 }}>
            <View style={styles.activityRow}>
              <View style={[styles.iconCircle, { backgroundColor: colors.activityPlay + '25' }]}>
                <Text style={styles.activityIcon}>🎮</Text>
              </View>
              <View style={styles.activityInfo}>
                <View style={styles.activityHeader}>
                  <Text style={styles.activityTitle}>Playtime</Text>
                  <Text style={styles.activityTime}>3:00 PM</Text>
                </View>
                <Text style={styles.activityText}>Played with blocks for 30 minutes.</Text>
              </View>
            </View>
          </Card>
        </View>
      </ScrollView>

      <Fab icon="+" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md, gap: spacing.md,
  },
  backArrow: { fontSize: 24, color: colors.textPrimary },
  headerTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  filterIcon: { fontSize: 22 },

  filterRow: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },

  dateRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, marginBottom: spacing.md,
  },
  dateLabel: { fontSize: fontSizes.sm, fontWeight: '700', color: colors.textSecondary },
  markRead: { fontSize: fontSizes.xs, color: colors.primary },

  cardWrapper: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },

  activityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary,
    marginTop: 6, marginLeft: -4, marginRight: -4,
  },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
  },
  activityIcon: { fontSize: 20 },
  activityInfo: { flex: 1 },
  activityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activityTitle: { fontSize: fontSizes.base, fontWeight: '700', color: colors.textPrimary },
  activityTime: { fontSize: fontSizes.xs, color: colors.textMuted },
  activityText: { fontSize: fontSizes.sm, color: colors.textSecondary, marginTop: 4, lineHeight: 20 },
});
