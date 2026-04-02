import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge, Card } from '@mobile/components';
import { colors, fontSizes, radii, shadows, spacing } from '@mobile/lib/theme';

const ACTIONS = [
  { icon: '🎤', label: 'Speak' },
  { icon: '📷', label: 'Photo' },
  { icon: '⏺', label: 'Record' },
];

const ACTIVITY = [
  { icon: '🔔', text: 'Motion detected — Nursery', time: '1:45 PM' },
  { icon: '🍼', text: 'Feeding started — 6 oz', time: '1:30 PM' },
  { icon: '💤', text: 'Nap started', time: '12:15 PM' },
];

export default function LiveMonitorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Live Monitor</Text>
        <Text style={styles.gearIcon}>⚙️</Text>
      </View>

      {/* Video player placeholder */}
      <View style={styles.videoContainer}>
        <View style={styles.videoPlaceholder}>
          <Text style={styles.videoIcon}>📹</Text>
          <Text style={styles.videoLabel}>Nursery Camera</Text>
        </View>
        {/* Overlays */}
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        <View style={styles.roomChip}>
          <Text style={styles.roomText}>🏠 Nursery</Text>
        </View>
        <View style={styles.dutyBar}>
          <Text style={styles.dutyText}>Elena Martinez is on duty</Text>
        </View>
        <View style={styles.hdChip}>
          <Text style={styles.hdText}>1080p HD</Text>
        </View>
      </View>

      {/* Awareness banner */}
      <View style={styles.awarenessBanner}>
        <Text style={styles.awarenessText}>👁 Elena has been notified you are watching</Text>
      </View>

      {/* Action buttons */}
      <View style={styles.actionsRow}>
        {ACTIONS.map((a) => (
          <Pressable key={a.label} style={styles.actionBtn}>
            <Text style={styles.actionIcon}>{a.icon}</Text>
            <Text style={styles.actionLabel}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Session timer */}
      <View style={styles.timerRow}>
        <Text style={styles.timerText}>⏱ 01:23:45</Text>
        <Pressable style={styles.stopBtn}>
          <Text style={styles.stopText}>■</Text>
        </Pressable>
        <Text style={styles.historyIcon}>📋</Text>
      </View>

      {/* Recent activity */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        {ACTIVITY.map((a, i) => (
          <View key={i} style={styles.activityRow}>
            <Text style={styles.activityIcon}>{a.icon}</Text>
            <Text style={styles.activityText}>{a.text}</Text>
            <Text style={styles.activityTime}>{a.time}</Text>
          </View>
        ))}
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
  headerTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  gearIcon: { fontSize: 22 },

  videoContainer: {
    marginHorizontal: spacing.lg, borderRadius: radii.lg, overflow: 'hidden',
    backgroundColor: '#1A1A2E', aspectRatio: 4 / 3, position: 'relative',
  },
  videoPlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  videoIcon: { fontSize: 48, opacity: 0.5 },
  videoLabel: { color: 'rgba(255,255,255,0.4)', marginTop: spacing.sm },

  liveBadge: {
    position: 'absolute', top: spacing.md, left: spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(239,68,68,0.9)', borderRadius: radii.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.white },
  liveText: { color: colors.white, fontSize: fontSizes.xs, fontWeight: '700' },

  roomChip: {
    position: 'absolute', top: spacing.md, right: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: radii.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  roomText: { fontSize: fontSizes.xs, fontWeight: '600' },

  dutyBar: {
    position: 'absolute', bottom: spacing.md, left: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: radii.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  dutyText: { color: colors.white, fontSize: fontSizes.xs },

  hdChip: {
    position: 'absolute', bottom: spacing.md, right: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radii.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  hdText: { color: colors.white, fontSize: fontSizes.xs },

  awarenessBanner: {
    marginHorizontal: spacing.lg, marginTop: spacing.md,
    backgroundColor: colors.careMint + '30', borderRadius: radii.md,
    padding: spacing.md, alignItems: 'center',
  },
  awarenessText: { fontSize: fontSizes.sm, color: colors.nannyGreen, fontWeight: '600' },

  actionsRow: {
    flexDirection: 'row', justifyContent: 'center',
    gap: spacing.xl, marginTop: spacing['2xl'], paddingHorizontal: spacing.lg,
  },
  actionBtn: {
    width: 72, height: 72, borderRadius: radii.md, borderWidth: 1.5,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  actionIcon: { fontSize: 24 },
  actionLabel: { fontSize: fontSizes.xs, color: colors.textSecondary, marginTop: 4 },

  timerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.lg, marginTop: spacing['2xl'],
  },
  timerText: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.textPrimary },
  stopBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.error,
    alignItems: 'center', justifyContent: 'center',
  },
  stopText: { color: colors.white, fontSize: 14 },
  historyIcon: { fontSize: 22 },

  section: { paddingHorizontal: spacing.lg, marginTop: spacing['2xl'] },
  sectionTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  activityRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.surface,
  },
  activityIcon: { fontSize: 18 },
  activityText: { flex: 1, fontSize: fontSizes.sm, color: colors.textPrimary },
  activityTime: { fontSize: fontSizes.xs, color: colors.textMuted },
});
