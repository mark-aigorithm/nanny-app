import { View, Text, StyleSheet, Pressable } from 'react-native';

import { Avatar } from '@mobile/components/avatar';
import { colors, fontSizes, radii, shadows, spacing } from '@mobile/lib/theme';

type NannyCardProps = {
  name: string;
  photo?: string;
  rating: number;
  reviewCount: number;
  hourlyRate: number;
  distance?: string;
  verified?: boolean;
  onPress?: () => void;
};

export function NannyCard({ name, photo, rating, reviewCount, hourlyRate, distance, verified = true, onPress }: NannyCardProps) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <Avatar uri={photo} name={name} size={64} />
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {verified && <Text style={styles.verified}>&#x1F6E1;&#xFE0F;</Text>}
        </View>
        <Text style={styles.rating}>
          {'⭐'} {rating} ({reviewCount})
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.rate}>${hourlyRate}/hr</Text>
        {distance && (
          <View style={styles.distancePill}>
            <Text style={styles.distanceText}>{distance}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginRight: spacing.md,
    width: 200,
    ...shadows.md,
  },
  info: {
    marginTop: spacing.sm,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  name: {
    fontSize: fontSizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  verified: { fontSize: 14 },
  rating: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  right: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rate: {
    fontSize: fontSizes.base,
    fontWeight: '700',
    color: colors.primary,
  },
  distancePill: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  distanceText: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
  },
});
