import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, Card } from '@mobile/components';
import { colors, fontSizes, radii, shadows, spacing } from '@mobile/lib/theme';

const QUICK_ENTRIES = [
  { icon: '🍼', label: 'Meal', color: colors.activityMeal },
  { icon: '💤', label: 'Nap', color: colors.activityNap },
  { icon: '🌿', label: 'Diaper', color: colors.activityDiaper },
  { icon: '🎮', label: 'Activity', color: colors.activityPlay },
];

const LOG_ENTRIES = [
  { icon: '🍼', color: colors.activityMeal, title: 'Feeding', detail: '6 oz formula', time: '1:30 PM' },
  { icon: '💤', color: colors.activityNap, title: 'Nap started', detail: '', time: '12:00 PM' },
  { icon: '🌿', color: colors.activityDiaper, title: 'Diaper', detail: 'Wet', time: '11:15 AM' },
];

export default function NannyCareLogScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 180 }}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <Text style={styles.headerTitle}>Care Log</Text>
          <Text style={styles.dateText}>Apr 12</Text>
        </View>

        {/* Child banner */}
        <View style={styles.childBanner}>
          <Avatar name="Baby Liam" size={48} />
          <View style={styles.childInfo}>
            <Text style={styles.childName}>Baby Liam · 8 months</Text>
            <View style={styles.statusChip}>
              <Text style={styles.statusText}>Last: Nap ended 45 min ago</Text>
            </View>
          </View>
        </View>

        {/* Quick entry grid */}
        <View style={styles.quickGrid}>
          {QUICK_ENTRIES.map((e) => (
            <Pressable key={e.label} style={[styles.quickTile, { backgroundColor: e.color + '25' }]}>
              <Text style={styles.quickIcon}>{e.icon}</Text>
              <Text style={[styles.quickLabel, { color: e.color }]}>{e.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Today's log */}
        <View style={styles.section}>
          <View style={styles.logHeader}>
            <Text style={styles.sectionTitle}>Today's Log</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{LOG_ENTRIES.length}</Text>
            </View>
          </View>

          {LOG_ENTRIES.map((entry, i) => (
            <Pressable key={i} style={styles.logRow}>
              <View style={[styles.logDot, { backgroundColor: entry.color }]} />
              <View style={styles.logInfo}>
                <Text style={styles.logTitle}>{entry.title}</Text>
                {entry.detail ? <Text style={styles.logDetail}>{entry.detail}</Text> : null}
              </View>
              <Text style={styles.logTime}>{entry.time}</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Bottom sheet peek (simplified) */}
      <View style={styles.sheetPeek}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Log Nap</Text>
        <View style={styles.sheetTimeRow}>
          <Text style={styles.sheetTimeLabel}>Time</Text>
          <Text style={styles.sheetTimeValue}>1:30 PM</Text>
        </View>
        <View style={styles.sheetToggleRow}>
          <Pressable style={[styles.sheetToggle, styles.sheetToggleActive]}>
            <Text style={styles.sheetToggleActiveText}>Falling Asleep</Text>
          </Pressable>
          <Pressable style={styles.sheetToggle}>
            <Text style={styles.sheetToggleText}>Woke Up</Text>
          </Pressable>
        </View>
        <Button title="Save" color={colors.nannyGreen} fullWidth />
        <Pressable style={styles.discardLink}>
          <Text style={styles.discardText}>Discard</Text>
        </Pressable>
      </View>

      {/* Sticky footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button title="📤  Send Daily Update to Mom" variant="outline" color={colors.nannyGreen} fullWidth />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingBottom: spacing.lg,
  },
  headerTitle: { fontSize: fontSizes.xl, fontWeight: '700', color: colors.textPrimary },
  dateText: { fontSize: fontSizes.sm, color: colors.textSecondary },

  childBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginHorizontal: spacing.lg, backgroundColor: colors.white,
    borderRadius: radii.lg, padding: spacing.lg, ...shadows.sm,
    marginBottom: spacing.xl,
  },
  childInfo: { flex: 1 },
  childName: { fontSize: fontSizes.base, fontWeight: '700', color: colors.textPrimary },
  statusChip: {
    backgroundColor: colors.careMint + '30', borderRadius: radii.full,
    paddingHorizontal: spacing.sm, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 4,
  },
  statusText: { fontSize: fontSizes.xs, color: colors.nannyGreen, fontWeight: '600' },

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

  section: { paddingHorizontal: spacing.lg },
  logHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  sectionTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.textPrimary },
  countBadge: {
    backgroundColor: colors.nannyGreen, borderRadius: radii.full,
    width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
  },
  countText: { color: colors.white, fontSize: fontSizes.xs, fontWeight: '700' },

  logRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.surface,
  },
  logDot: { width: 10, height: 10, borderRadius: 5 },
  logInfo: { flex: 1 },
  logTitle: { fontSize: fontSizes.base, fontWeight: '600', color: colors.textPrimary },
  logDetail: { fontSize: fontSizes.sm, color: colors.textSecondary },
  logTime: { fontSize: fontSizes.sm, color: colors.textMuted },
  chevron: { fontSize: 18, color: colors.textMuted },

  sheetPeek: {
    position: 'absolute', bottom: 80, left: 0, right: 0,
    backgroundColor: colors.white, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg,
    padding: spacing.xl, ...shadows.lg, display: 'none', // Hidden by default in static UI
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.lg,
  },
  sheetTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.lg },
  sheetTimeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.lg },
  sheetTimeLabel: { fontSize: fontSizes.sm, color: colors.textSecondary },
  sheetTimeValue: { fontSize: fontSizes.base, fontWeight: '600', color: colors.textPrimary },
  sheetToggleRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  sheetToggle: {
    flex: 1, paddingVertical: spacing.md, borderRadius: radii.md, borderWidth: 1,
    borderColor: colors.border, alignItems: 'center',
  },
  sheetToggleActive: { backgroundColor: colors.nannyGreen, borderColor: colors.nannyGreen },
  sheetToggleActiveText: { color: colors.white, fontWeight: '700' },
  sheetToggleText: { color: colors.textSecondary, fontWeight: '600' },
  discardLink: { alignItems: 'center', marginTop: spacing.md },
  discardText: { color: colors.textMuted, fontSize: fontSizes.sm },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.white, paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
});
