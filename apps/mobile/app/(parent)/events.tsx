import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Badge, Chip, Fab } from '@mobile/components';
import { colors, fontSizes, radii, shadows, spacing } from '@mobile/lib/theme';

const FILTERS = ['All Events', 'Playdates', 'Educational', 'Workshops'];

const EVENTS = [
  {
    id: '1', title: 'Saturday Storytime & Playdate', date: 'APR 19',
    ages: 'Ages 0-3', location: 'Prospect Park', going: 14,
    color: colors.primary,
  },
  {
    id: '2', title: 'Baby Sign Language Workshop', date: 'APR 23',
    ages: 'Ages 6-18 months', location: 'Park Slope Community Center', going: 8,
    color: colors.communityPink, urgency: 'Only 2 spots left!',
  },
];

export default function EventsScreen() {
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
          <Text style={styles.headerTitle}>Events Near You</Text>
          <View style={styles.locationChip}>
            <Text style={styles.locationText}>📍 Brooklyn NY</Text>
          </View>
          <Text style={styles.searchIcon}>🔍</Text>
        </View>

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTERS.map((f, i) => (
            <Chip key={f} label={f} active={i === 0} />
          ))}
        </ScrollView>

        {/* Event cards */}
        {EVENTS.map((event) => (
          <View key={event.id} style={styles.eventCard}>
            {/* Cover image placeholder */}
            <View style={[styles.coverImage, { backgroundColor: event.color + '20' }]}>
              <Text style={styles.coverEmoji}>🌳</Text>
              <View style={styles.dateBadge}>
                <Text style={styles.dateText}>{event.date}</Text>
              </View>
              <Pressable style={styles.heartBtn}>
                <Text style={styles.heartIcon}>♡</Text>
              </Pressable>
            </View>

            <View style={styles.eventInfo}>
              <Text style={styles.eventTitle}>{event.title}</Text>
              <Text style={styles.eventMeta}>👶 {event.ages}</Text>
              <Text style={styles.eventMeta}>📍 {event.location}</Text>

              <View style={styles.goingRow}>
                <View style={styles.avatarGroup}>
                  <Avatar name="A" size={24} />
                  <Avatar name="B" size={24} />
                  <Avatar name="C" size={24} />
                </View>
                <Text style={styles.goingText}>+{event.going} going</Text>
                {event.urgency && (
                  <Badge label={event.urgency} bgColor={colors.warning + '20'} color={colors.warning} size="sm" />
                )}
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      <Fab color={colors.communityPink} icon="+" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md, gap: spacing.sm,
  },
  backArrow: { fontSize: 24, color: colors.textPrimary },
  headerTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  locationChip: {
    backgroundColor: colors.surface, borderRadius: radii.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  locationText: { fontSize: fontSizes.xs, fontWeight: '600', color: colors.textSecondary },
  searchIcon: { fontSize: 22 },

  filterRow: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },

  eventCard: {
    marginHorizontal: spacing.lg, marginBottom: spacing.lg,
    borderRadius: radii.lg, backgroundColor: colors.white, overflow: 'hidden',
    ...shadows.md,
  },
  coverImage: {
    height: 160, alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  coverEmoji: { fontSize: 48, opacity: 0.4 },
  dateBadge: {
    position: 'absolute', top: spacing.md, left: spacing.md,
    backgroundColor: colors.error, borderRadius: radii.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  dateText: { color: colors.white, fontWeight: '700', fontSize: fontSizes.xs },
  heartBtn: { position: 'absolute', top: spacing.md, right: spacing.md },
  heartIcon: { fontSize: 24, color: colors.white },

  eventInfo: { padding: spacing.lg },
  eventTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  eventMeta: { fontSize: fontSizes.sm, color: colors.textSecondary, marginBottom: 4 },

  goingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  avatarGroup: { flexDirection: 'row' },
  goingText: { fontSize: fontSizes.sm, color: colors.textSecondary, flex: 1 },
});
