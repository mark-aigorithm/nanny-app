import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '@mobile/components/ui/text';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily, BOTTOM_NAV_HEIGHT } from '@mobile/theme';

export type NannyBottomNavTab = 'dashboard' | 'requests' | 'profile';

interface Props {
  activeTab: NannyBottomNavTab;
}

const TABS: {
  key: NannyBottomNavTab;
  label: string;
  activeIcon: keyof typeof Ionicons.glyphMap;
  inactiveIcon: keyof typeof Ionicons.glyphMap;
  href: '/(nanny)/dashboard' | '/(nanny)/requests' | '/(nanny)/profile';
}[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    activeIcon: 'grid',
    inactiveIcon: 'grid-outline',
    href: '/(nanny)/dashboard',
  },
  {
    key: 'requests',
    label: 'Requests',
    activeIcon: 'document-text',
    inactiveIcon: 'document-text-outline',
    href: '/(nanny)/requests',
  },
  {
    key: 'profile',
    label: 'Profile',
    activeIcon: 'person',
    inactiveIcon: 'person-outline',
    href: '/(nanny)/profile',
  },
];

export default function NannyBottomNav({ activeTab }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // The bar's tinted background runs down under the system's bottom bar, and
  // the tabs sit above it, however tall that bar is on this device.
  return (
    <View
      style={[
        styles.container,
        { height: BOTTOM_NAV_HEIGHT + insets.bottom, paddingBottom: insets.bottom },
      ]}
    >
      {TABS.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            style={styles.navItem}
            onPress={() => router.push(tab.href)}
          >
            <Ionicons
              name={isActive ? tab.activeIcon : tab.inactiveIcon}
              size={22}
              color={isActive ? colors.primary : colors.textMuted}
            />
            <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.taupe,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 4,
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 16,
  },
  labelActive: {
    color: colors.primary,
  },
});
