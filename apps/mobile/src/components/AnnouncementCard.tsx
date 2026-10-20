import React, { memo } from 'react';
import { Image, Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  NOTIFICATION_IMAGE_HEIGHT,
  NOTIFICATION_IMAGE_WIDTH,
  type NotificationLink,
  type NotificationResponse,
} from '@nanny-app/shared';

import { Text } from '@mobile/components/ui/text';
import { formatTimeAgo } from '@mobile/lib/communityUtils';
import { textDirectionStyle } from '@mobile/lib/textDirection';
import { colors } from '@mobile/theme';
import { styles } from './styles/announcement-card.styles';

// Drawn at the size admins crop to (1024×512), so the box never jumps when the
// image arrives and the artwork is never re-cropped.
const IMAGE_RATIO = { aspectRatio: NOTIFICATION_IMAGE_WIDTH / NOTIFICATION_IMAGE_HEIGHT };

/** What a tap does, in words — shown under the body and read as part of the label. */
export function announcementAction(link: NotificationLink | null): string | null {
  if (!link) return null;
  return link.type === 'package' ? 'View package' : `Book with code ${link.code}`;
}

type Props = {
  notification: NotificationResponse;
  onPress: () => void;
};

/**
 * An admin announcement in the inbox: title, the whole body, an optional image
 * and what tapping does. The whole card is one button — its label is the title
 * plus the action, the body is its hint, and the image is decorative (hidden
 * from screen readers). Android shows a ripple, iOS dims.
 */
function AnnouncementCard({ notification, onPress }: Props) {
  const action = announcementAction(notification.link);
  // Keeps the code (or "package") on the line with the word before it.
  const actionDisplay = action?.replace(/ (?=\S+$)/, ' ') ?? null;
  const isUnread = !notification.isRead;

  return (
    <View style={styles.shadow}>
      <Pressable
        testID={`announcement.${notification.id}`}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={action ? `${notification.title}. ${action}` : notification.title}
        accessibilityHint={notification.body}
        android_ripple={{ color: colors.overlayLight }}
        style={({ pressed }) => [
          styles.card,
          isUnread && styles.cardUnread,
          Platform.OS === 'ios' && pressed && styles.cardPressedIos,
        ]}
      >
        {notification.imageUrl ? (
          <View
            testID="announcement.image"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.imageBox, IMAGE_RATIO]}
          >
            <Image
              source={{ uri: notification.imageUrl }}
              style={styles.image}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          </View>
        ) : null}

        <View style={styles.titleRow}>
          <Text style={[styles.title, textDirectionStyle(notification.title)]}>
            {notification.title}
          </Text>
          <Text style={styles.time}>{formatTimeAgo(notification.createdAt)}</Text>
        </View>

        <Text style={[styles.body, textDirectionStyle(notification.body)]}>{notification.body}</Text>

        {actionDisplay ? (
          <View style={styles.actionRow}>
            <Text style={styles.actionText}>{actionDisplay}</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.primaryDark} />
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

/**
 * Memoised on the notification alone. The inbox refetches every 15 s and React
 * Query keeps unchanged rows as the same objects, so an unchanged card skips the
 * re-render. `onPress` is left out of the comparison on purpose: the screen
 * builds it inline from this same notification and stable hooks (router,
 * `mutate`), so a fresh closure does exactly what the old one did.
 */
export default memo(AnnouncementCard, (prev, next) => prev.notification === next.notification);
