import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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

  return (
    <View style={styles.container}>
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
    height: BOTTOM_NAV_HEIGHT,
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
