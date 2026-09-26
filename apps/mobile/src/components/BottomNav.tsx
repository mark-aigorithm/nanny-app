import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontFamily, spacing, borderRadius, shadows, motion } from '@mobile/theme';
import PressableScale from '@mobile/components/ui/pressable-scale';
import { useGuestGate } from '@mobile/hooks/useGuestGate';
import { useReducedMotion } from '@mobile/hooks/useReducedMotion';
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

const ICON_CIRCLE_SIZE = 36;
// navItem's paddingVertical — the icon circle's offset from the item's top edge.
const NAV_ITEM_PADDING_TOP = spacing.xs;

const TABS: {
  key: BottomNavTab;
  label: string;
  activeIcon: keyof typeof Ionicons.glyphMap;
  inactiveIcon: keyof typeof Ionicons.glyphMap;
  href: '/(parent)/(tabs)/home' | '/(parent)/(tabs)/services' | '/(parent)/(tabs)/bookings' | '/(parent)/(tabs)/mother-profile';
}[] = [
  {
    key: 'home',
    label: 'Home',
    activeIcon: 'home',
    inactiveIcon: 'home-outline',
    href: '/(parent)/(tabs)/home',
  },
  {
    key: 'services',
    label: 'Services',
    activeIcon: 'grid',
    inactiveIcon: 'grid-outline',
    href: '/(parent)/(tabs)/services',
  },
  {
    key: 'activity',
    label: 'Activity',
    activeIcon: 'receipt',
    inactiveIcon: 'receipt-outline',
    href: '/(parent)/(tabs)/bookings',
  },
  {
    key: 'account',
    label: 'Account',
    activeIcon: 'person',
    inactiveIcon: 'person-outline',
    href: '/(parent)/(tabs)/mother-profile',
  },
];

/**
 * Uber-style floating pill tab bar. Absolutely positioned above the bottom
 * safe area; screens pad scroll content with FLOATING_NAV_CLEARANCE so nothing
 * hides behind it. Mounted once by `ParentTabBar` (the parent Tabs' `tabBar`),
 * so it persists across tab switches and the sage indicator can glide from
 * the old tab to the new one.
 */
export default function BottomNav({ activeTab }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { isGuest, gate } = useGuestGate();
  const { data: unreadData } = useUnreadMessageCount(!isGuest);
  const hasUnread = (unreadData?.unreadCount ?? 0) > 0;

  // Where each tab's icon circle sits inside the pill, measured on layout.
  const [slots, setSlots] = useState<Partial<Record<BottomNavTab, { x: number; y: number }>>>({});
  const indicatorX = useRef(new Animated.Value(0)).current;
  const iconPop = useRef(new Animated.Value(1)).current;
  const placedTab = useRef<BottomNavTab | null>(null);
  const activeSlot = slots[activeTab];

  useEffect(() => {
    if (!activeSlot) return;
    const isFirstPlacement = placedTab.current === null;
    const tabChanged = placedTab.current !== activeTab;
    placedTab.current = activeTab;

    if (isFirstPlacement || reducedMotion) {
      indicatorX.setValue(activeSlot.x);
      return;
    }
    Animated.spring(indicatorX, {
      toValue: activeSlot.x,
      ...motion.spring.indicator,
      useNativeDriver: true,
    }).start();
    if (tabChanged) {
      iconPop.setValue(0.85);
      Animated.spring(iconPop, { toValue: 1, ...motion.spring.press, useNativeDriver: true }).start();
    }
  }, [activeTab, activeSlot, reducedMotion, indicatorX, iconPop]);

  const measureSlot = (key: BottomNavTab) => (event: LayoutChangeEvent) => {
    const { x, y, width } = event.nativeEvent.layout;
    const slot = { x: x + (width - ICON_CIRCLE_SIZE) / 2, y: y + NAV_ITEM_PADDING_TOP };
    setSlots(prev => {
      const current = prev[key];
      if (current && current.x === slot.x && current.y === slot.y) return prev;
      return { ...prev, [key]: slot };
    });
  };

  return (
    <View
      style={[styles.wrapper, { bottom: insets.bottom + spacing.md }]}
      pointerEvents="box-none"
    >
      <View style={styles.pill}>
        {activeSlot && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              { top: activeSlot.y, transform: [{ translateX: indicatorX }] },
            ]}
          />
        )}
        {TABS.map(tab => {
          const isActive = tab.key === activeTab;
          const guestMessage = GUEST_GATE_MESSAGES[tab.key];
          const navigate = () => router.navigate(tab.href);
          return (
            <PressableScale
              key={tab.key}
              style={styles.navItem}
              haptic="select"
              onLayout={measureSlot(tab.key)}
              onPress={guestMessage ? gate(navigate, guestMessage) : navigate}
            >
              {/* Until the glide indicator is measured, the circle paints its own tint. */}
              <View style={[styles.iconCircle, isActive && !activeSlot && styles.iconCircleActive]}>
                <Animated.View style={isActive ? { transform: [{ scale: iconPop }] } : undefined}>
                  <Ionicons
                    name={isActive ? tab.activeIcon : tab.inactiveIcon}
                    size={20}
                    color={isActive ? colors.textPrimary : colors.textMuted}
                  />
                </Animated.View>
                {tab.key === 'account' && hasUnread && (
                  <View style={styles.badge} testID="account-unread-badge" />
                )}
              </View>
              <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
            </PressableScale>
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
    paddingVertical: NAV_ITEM_PADDING_TOP,
    gap: spacing.xxs,
  },
  iconCircle: {
    width: ICON_CIRCLE_SIZE,
    height: ICON_CIRCLE_SIZE,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleActive: {
    backgroundColor: colors.primaryMuted,
  },
  indicator: {
    position: 'absolute',
    left: 0,
    width: ICON_CIRCLE_SIZE,
    height: ICON_CIRCLE_SIZE,
    borderRadius: borderRadius.full,
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
