import React from 'react';
import { View } from 'react-native';
import type { NotificationResponse } from '@nanny-app/shared';

import { IconCircle, PressableScale } from '@mobile/components/ui';
import { Text } from '@mobile/components/ui/text';
import { formatTimeAgo } from '@mobile/lib/communityUtils';
import { getNotificationIcon } from '@mobile/lib/notificationUtils';
import { styles } from './styles/notification-row.styles';

/**
 * One row of the notifications list, shared by the parent and nanny screens.
 * The title carries the meaning, so it wraps in full (UI-sweep rule: titles get
 * 2+ lines at 1.3×); the timestamp beside it is the side that gives way.
 */
export default function NotificationRow({
  notification,
  onPress,
}: {
  notification: NotificationResponse;
  onPress: () => void;
}) {
  const isUnread = !notification.isRead;
  const icon = getNotificationIcon(notification.type);

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      accessibilityRole="button"
      style={[styles.card, isUnread ? styles.cardUnread : styles.cardRead]}
    >
      <IconCircle
        icon={icon.name}
        size="md"
        backgroundColor={icon.backgroundColor}
        iconColor={icon.iconColor}
        iconSize={18}
        style={styles.iconCircle}
      />
      <View style={styles.cardTextWrap}>
        <View style={styles.cardTitleRow}>
          <Text style={[styles.cardTitle, isUnread && styles.cardTitleUnread]}>{notification.title}</Text>
          <Text style={styles.cardTime}>{formatTimeAgo(notification.createdAt)}</Text>
        </View>
        <Text style={[styles.cardSubtitle, isUnread && styles.cardSubtitleUnread]} numberOfLines={2}>
          {notification.body}
        </Text>
      </View>
    </PressableScale>
  );
}
