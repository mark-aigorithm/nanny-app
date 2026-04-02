import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Badge, Card } from '@mobile/components';
import { colors, fontSizes, radii, shadows, spacing } from '@mobile/lib/theme';

const SETTINGS = [
  { icon: '👤', label: 'Account Details', badge: null },
  { icon: '🤱', label: 'My Nannies', badge: '5' },
  { icon: '💳', label: 'Payment Methods', badge: null },
  { icon: '🔔', label: 'Notifications', badge: null },
  { icon: '❓', label: 'Help & Support', badge: null, route: '/(parent)/support' },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={{ paddingTop: insets.top + spacing.xl }}>
        {/* Header */}
        <Text style={styles.headerTitle}>Profile</Text>

        {/* Profile hero */}
        <View style={styles.hero}>
          <View style={styles.avatarWrapper}>
            <Avatar name="Sarah Johnson" size={96} />
            <View style={styles.cameraOverlay}>
              <Text style={styles.cameraIcon}>📷</Text>
            </View>
          </View>
          <Badge label="Pro Member" bgColor="#F59E0B20" color="#F59E0B" />
          <Text style={styles.name}>Sarah Johnson</Text>
          <Text style={styles.location}>📍 Brooklyn, NY</Text>
          <Pressable style={styles.editBtn}>
            <Text style={styles.editText}>Edit Profile</Text>
          </Pressable>
        </View>

        {/* Wallet cards */}
        <View style={styles.walletRow}>
          <Card style={styles.walletCard}>
            <Text style={styles.walletIcon}>💰</Text>
            <Text style={styles.walletAmount}>$47.50</Text>
            <Text style={styles.walletLabel}>Available credit</Text>
          </Card>
          <Card style={styles.walletCard}>
            <Text style={styles.walletIcon}>⭐</Text>
            <Text style={styles.walletAmount}>320 pts</Text>
            <Text style={styles.walletLabel}>≈ $3.20 value</Text>
            <Pressable><Text style={styles.earnMore}>Earn more</Text></Pressable>
          </Card>
        </View>

        {/* Settings list */}
        <View style={styles.settingsList}>
          {SETTINGS.map((s) => (
            <Pressable
              key={s.label}
              style={styles.settingsRow}
              onPress={() => s.route && router.push(s.route as never)}
            >
              <Text style={styles.settingsIcon}>{s.icon}</Text>
              <Text style={styles.settingsLabel}>{s.label}</Text>
              {s.badge && (
                <View style={styles.settingsBadge}>
                  <Text style={styles.settingsBadgeText}>{s.badge}</Text>
                </View>
              )}
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}

          {/* Log out */}
          <Pressable style={styles.settingsRow}>
            <Text style={styles.settingsIcon}>🚪</Text>
            <Text style={[styles.settingsLabel, { color: colors.error }]}>Log Out</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  headerTitle: {
    fontSize: fontSizes.xl, fontWeight: '700', color: colors.textPrimary,
    paddingHorizontal: spacing.lg, marginBottom: spacing['2xl'],
  },

  hero: { alignItems: 'center', marginBottom: spacing['2xl'] },
  avatarWrapper: { position: 'relative', marginBottom: spacing.md },
  cameraOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    ...shadows.sm,
  },
  cameraIcon: { fontSize: 16 },
  name: { fontSize: fontSizes.xl, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.sm },
  location: { fontSize: fontSizes.sm, color: colors.textSecondary, marginTop: 4 },
  editBtn: {
    borderWidth: 1.5, borderColor: colors.primary, borderRadius: radii['2xl'],
    paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, marginTop: spacing.md,
  },
  editText: { color: colors.primary, fontWeight: '700', fontSize: fontSizes.sm },

  walletRow: {
    flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.md, marginBottom: spacing['2xl'],
  },
  walletCard: { flex: 1, alignItems: 'center' },
  walletIcon: { fontSize: 24, marginBottom: spacing.sm },
  walletAmount: { fontSize: fontSizes['2xl'], fontWeight: '700', color: colors.primary },
  walletLabel: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  earnMore: { fontSize: fontSizes.xs, color: colors.communityPink, fontWeight: '600', marginTop: spacing.xs },

  settingsList: { paddingHorizontal: spacing.lg },
  settingsRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: colors.surface, gap: spacing.md,
  },
  settingsIcon: { fontSize: 20 },
  settingsLabel: { fontSize: fontSizes.base, color: colors.textPrimary, flex: 1 },
  settingsBadge: {
    backgroundColor: colors.primary, borderRadius: radii.full,
    paddingHorizontal: spacing.sm, paddingVertical: 2, minWidth: 24, alignItems: 'center',
  },
  settingsBadgeText: { color: colors.white, fontSize: fontSizes.xs, fontWeight: '700' },
  chevron: { fontSize: 22, color: colors.textMuted },
});
