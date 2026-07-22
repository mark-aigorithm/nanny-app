import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontFamily, spacing, borderRadius, shadows } from '@mobile/theme';
import { useGuestGate } from '@mobile/hooks/useGuestGate';
import { useUnreadMessageCount } from '@mobile/hooks/useMessaging';

export type BottomNavTab = 'home' | 'services' | 'activity' | 'account';

// Account-bound tabs open the register prompt for guests instead of navigating.
const GUEST_GATE_MESSAGES: Partial<Record<BottomNavTab, string>> = {
  activity: 'Create your free account to book and manage care.',
  account: 'Create your free account to set up your profile.',
};

interface Props {
  activeTab: BottomNavTab;
}

const TABS: {
  key: BottomNavTab;
  label: string;
  activeIcon: keyof typeof Ionicons.glyphMap;
  inactiveIcon: keyof typeof Ionicons.glyphMap;
  href: '/(parent)/home' | '/(parent)/services' | '/(parent)/bookings' | '/(parent)/mother-profile';
}[] = [
  {
    key: 'home',
    label: 'Home',
    activeIcon: 'home',
    inactiveIcon: 'home-outline',
    href: '/(parent)/home',
  },
  {
    key: 'services',
    label: 'Services',
    activeIcon: 'grid',
    inactiveIcon: 'grid-outline',
    href: '/(parent)/services',
  },
  {
    key: 'activity',
    label: 'Activity',
    activeIcon: 'receipt',
    inactiveIcon: 'receipt-outline',
    href: '/(parent)/bookings',
  },
  {
    key: 'account',
    label: 'Account',
    activeIcon: 'person',
    inactiveIcon: 'person-outline',
    href: '/(parent)/mother-profile',
  },
];

/**
 * Uber-style floating pill tab bar. Absolutely positioned above the bottom
 * safe area — screens keep it in JSX flow but pad scroll content with
 * FLOATING_NAV_CLEARANCE so nothing hides behind it.
 */
export default function BottomNav({ activeTab }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isGuest, gate } = useGuestGate();
  const { data: unreadData } = useUnreadMessageCount(!isGuest);
  const hasUnread = (unreadData?.unreadCount ?? 0) > 0;

  return (
    <View
      style={[styles.wrapper, { bottom: insets.bottom + spacing.md }]}
      pointerEvents="box-none"
    >
      <View style={styles.pill}>
        {TABS.map(tab => {
          const isActive = tab.key === activeTab;
          const guestMessage = GUEST_GATE_MESSAGES[tab.key];
          const navigate = () => router.push(tab.href);
          return (
            <Pressable
              key={tab.key}
              style={styles.navItem}
              onPress={guestMessage ? gate(navigate, guestMessage) : navigate}
            >
              <View style={[styles.iconCircle, isActive && styles.iconCircleActive]}>
                <Ionicons
                  name={isActive ? tab.activeIcon : tab.inactiveIcon}
                  size={20}
                  color={isActive ? colors.textPrimary : colors.textMuted}
                />
                {tab.key === 'account' && hasUnread && (
                  <View style={styles.badge} testID="account-unread-badge" />
                )}
              </View>
              <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: spacing['2xl'],
    right: spacing['2xl'],
    alignItems: 'center',
    zIndex: 100,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    ...shadows.lg,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    gap: spacing.xxs,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleActive: {
    backgroundColor: colors.primaryMuted,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 14,
  },
  labelActive: {
    fontFamily: fontFamily.bold,
    color: colors.textPrimary,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.error,
  },
});
