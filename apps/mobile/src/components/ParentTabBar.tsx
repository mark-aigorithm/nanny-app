import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { motion } from '@mobile/theme';
import BottomNav from '@mobile/components/BottomNav';
import type { BottomNavTab } from '@mobile/components/BottomNav';
import { useReducedMotion } from '@mobile/hooks/useReducedMotion';

/**
 * Which parent routes show the floating bar, and which tab each one lights up.
 * Every other parent route (detail screens, the booking flow, chat) hides it.
 */
export const ROUTE_TO_TAB: Readonly<Record<string, BottomNavTab>> = {
  home: 'home',
  notifications: 'home',
  services: 'services',
  community: 'services',
  'community-feed': 'services',
  bookings: 'activity',
  messages: 'account',
  'mother-profile': 'account',
};

/**
 * The parent Tabs' `tabBar`: one persistent `BottomNav` over every screen, so
 * the active indicator glides between tabs instead of the whole bar being
 * re-mounted by each screen. Fades out on screens that don't carry the bar.
 */
export default function ParentTabBar({ state }: BottomTabBarProps) {
  const reducedMotion = useReducedMotion();
  const focusedRoute = state.routes[state.index]?.name;
  const tab = focusedRoute ? ROUTE_TO_TAB[focusedRoute] : undefined;
  const visible = tab !== undefined;

  // Keep the last tab lit while the bar fades out, rather than blanking it.
  const lastTab = useRef<BottomNavTab>(tab ?? 'home');
  if (tab) lastTab.current = tab;

  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(visible ? 1 : 0);
      return;
    }
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: motion.duration.fast,
      useNativeDriver: true,
    }).start();
  }, [visible, reducedMotion, opacity]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { opacity }]}
      pointerEvents={visible ? 'box-none' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      <BottomNav activeTab={lastTab.current} />
    </Animated.View>
  );
}
