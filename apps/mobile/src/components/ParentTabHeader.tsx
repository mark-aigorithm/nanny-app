import React from 'react';
import type { ReactNode } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import NotificationBellButton from '@mobile/components/NotificationBellButton';
import { APP_NAME } from '@mobile/constants';
import { Avatar } from '@mobile/components/ui';
import { useGuestGate } from '@mobile/hooks/useGuestGate';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import {
  colors,
  fontFamily,
  spacing,
  screenPadding,
  STATUS_BAR_HEIGHT,
  HEADER_HEIGHT,
} from '@mobile/theme';

interface ParentTabHeaderProps {
  bottomContent?: ReactNode;
}

export const PARENT_TAB_HEADER_HEIGHT = HEADER_HEIGHT;

export default function ParentTabHeader({ bottomContent }: ParentTabHeaderProps) {
  const router = useRouter();
  const profile = useUserProfileStore((s) => s.profile);
  const { gate } = useGuestGate();

  const openProfile = () => {
    router.push('/(parent)/mother-profile' as never);
  };

  return (
    <View style={styles.header} pointerEvents="box-none">
      <View style={styles.headerRow}>
        <Text style={styles.logoText}>{APP_NAME}</Text>
        <View style={styles.headerRight}>
          <NotificationBellButton iconSize={20} iconColor={colors.textPrimary} />
          <Pressable
            onPress={gate(openProfile, 'Create your free account to set up your profile.')}
          >
            <Avatar
              uri={profile?.avatarUrl ?? undefined}
              size="sm"
              fallbackInitial={profile?.firstName?.[0]}
              borderWidth={1}
              borderColor={colors.warmBorder}
            />
          </Pressable>
        </View>
      </View>
      {bottomContent}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.taupeHeader,
    zIndex: 100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    paddingTop: STATUS_BAR_HEIGHT + spacing.sm,
    paddingBottom: spacing.lg,
  },
  logoText: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -1.2,
    color: colors.primary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
