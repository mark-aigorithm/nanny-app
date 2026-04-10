import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, fontFamily, BOTTOM_NAV_HEIGHT } from '@mobile/theme';

export type BottomNavTab = 'home' | 'search' | 'community' | 'messages';

interface Props {
  activeTab: BottomNavTab;
  messagesBadge?: number;
}

const TABS: {
  key: BottomNavTab;
  label: string;
  activeIcon: keyof typeof Ionicons.glyphMap;
  inactiveIcon: keyof typeof Ionicons.glyphMap;
  href: '/(parent)/home' | '/(parent)/search' | '/(parent)/community' | '/(parent)/messages';
}[] = [
  {
    key: 'home',
    label: 'Home',
    activeIcon: 'home',
    inactiveIcon: 'home-outline',
    href: '/(parent)/home',
  },
  {
    key: 'search',
    label: 'Search',
    activeIcon: 'search',
    inactiveIcon: 'search-outline',
    href: '/(parent)/search',
  },
  {
    key: 'community',
    label: 'Community',
    activeIcon: 'people',
    inactiveIcon: 'people-outline',
    href: '/(parent)/community',
  },
  {
    key: 'messages',
    label: 'Messages',
    activeIcon: 'chatbubble',
    inactiveIcon: 'chatbubble-outline',
    href: '/(parent)/messages',
  },
];

export default function BottomNav({ activeTab, messagesBadge }: Props) {
  const router = useRouter();

  return (
    <View style={styles.container}>
      {TABS.map(tab => {
        const isActive = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            style={styles.navItem}
            onPress={() => router.push(tab.href)}
          >
            <View style={styles.iconWrapper}>
              <Ionicons
                name={isActive ? tab.activeIcon : tab.inactiveIcon}
                size={20}
                color={isActive ? colors.primary : colors.textMuted}
              />
              {tab.key === 'messages' && messagesBadge != null && messagesBadge > 0 && (
                <View style={styles.badge} />
              )}
            </View>
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
  iconWrapper: {
    position: 'relative',
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19.5,
  },
  labelActive: {
    color: colors.primary,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
});
