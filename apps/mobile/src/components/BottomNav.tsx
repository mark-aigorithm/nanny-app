import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export type BottomNavTab = 'home' | 'search' | 'community' | 'messages';

interface Props {
  activeTab: BottomNavTab;
  messagesBadge?: number;
}

const TABS: {
  key: BottomNavTab;
  label: string;
  activeIcon: string;
  inactiveIcon: string;
  href: string;
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
            onPress={() => router.push(tab.href as any)}
          >
            <View style={styles.iconWrapper}>
              <Ionicons
                name={(isActive ? tab.activeIcon : tab.inactiveIcon) as any}
                size={20}
                color={isActive ? '#97a591' : '#7a7a7a'}
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
    backgroundColor: '#e3d5ca',
    height: 80,
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
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#7a7a7a',
    lineHeight: 19.5,
  },
  labelActive: {
    color: '#97a591',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#c0634a',
  },
});
