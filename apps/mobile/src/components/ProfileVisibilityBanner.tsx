import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getMissingNannyProfileFields } from '@nanny-app/shared';

import {
  colors,
  fontFamily,
  spacing,
  borderRadius,
  shadows,
} from '@mobile/theme';
import { useNannyProfile } from '@mobile/hooks/useNannyProfile';

interface Props {
  ctaLabel: string;
  onPressCta: () => void;
}

/** Joins labels into a natural sentence fragment: "a", "a and b", "a, b and c". */
function joinNaturally(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  const head = items.slice(0, -1).join(', ');
  const tail = items[items.length - 1] ?? '';
  return `${head} and ${tail}`;
}

/**
 * Amber "urgent" banner shown to a nanny whose profile is hidden from parents
 * because required fields are missing. Renders nothing while loading or once the
 * profile is complete. The missing-field rule lives in `@nanny-app/shared`.
 */
export default function ProfileVisibilityBanner({ ctaLabel, onPressCta }: Props) {
  const { data, isLoading } = useNannyProfile();

  if (isLoading || !data) return null;

  const missing = getMissingNannyProfileFields(data);
  if (missing.length === 0) return null;

  const bodySentence = `Add your ${joinNaturally(
    missing.map((field) => field.label.toLowerCase()),
  )} to start getting bookings.`;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <Ionicons name="eye-off-outline" size={22} color={colors.tintAmber} />
        </View>
        <View style={styles.content}>
          <Text style={styles.eyebrow}>NOT VISIBLE TO PARENTS</Text>
          <Text style={styles.title}>Complete your profile to appear in search</Text>
        </View>
      </View>

      <Text style={styles.body}>{bodySentence}</Text>

      <View style={styles.chipsRow}>
        {missing.map((field) => (
          <View key={field.key} style={styles.chip}>
            <Text style={styles.chipText}>{field.label}</Text>
          </View>
        ))}
      </View>

      <Pressable
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        onPress={onPressCta}
        accessibilityRole="button"
        accessibilityLabel={ctaLabel}
      >
        <Text style={styles.ctaText}>{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.warmLight,
    borderWidth: 1,
    borderColor: colors.gold,
    ...shadows.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    fontFamily: fontFamily.extraBold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.tintAmber,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  body: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.gold,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  chipText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: colors.tintAmber,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: {
    opacity: 0.9,
  },
  ctaText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.white,
  },
});
