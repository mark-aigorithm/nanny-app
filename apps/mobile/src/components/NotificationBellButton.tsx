import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { Badge } from '@mobile/components/ui';
import { useUnreadNotificationCount } from '@mobile/hooks/useNotifications';
import { colors } from '@mobile/theme';

interface Props {
  iconSize?: number;
  iconColor?: string;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
  route?: '/(parent)/notifications' | '/(nanny)/notifications';
}

export default function NotificationBellButton({
  iconSize = 20,
  iconColor = colors.textPrimary,
  style,
  hitSlop = 8,
  route = '/(parent)/notifications',
}: Props) {
  const router = useRouter();
  const { data } = useUnreadNotificationCount();
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <Pressable
      style={[styles.button, style]}
      hitSlop={hitSlop}
      onPress={() => router.push(route)}
    >
      <Ionicons name="notifications-outline" size={iconSize} color={iconColor} />
      {unreadCount > 0 && (
        <View style={styles.badgeWrap}>
          <Badge count={unreadCount} size="sm" />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeWrap: {
    position: 'absolute',
    top: -2,
    right: -4,
  },
});
