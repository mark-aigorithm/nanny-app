import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { colors, fontFamily, typeScale, spacing, borderRadius } from '@mobile/theme';

type Props = {
  step: 1 | 2 | 3;
  title?: string;
  centered?: boolean;
  compact?: boolean;
};

export default function BookingStepProgress({
  step,
  title,
  centered = false,
  compact = false,
}: Props) {
  return (
    <View style={[styles.progressSection, centered && styles.progressSectionCentered]}>
      <View style={[styles.dotsRow, centered && styles.dotsRowCentered]}>
        {[1, 2, 3].map((n) => (
          <View
            key={n}
            style={[
              styles.dot,
              compact && styles.dotCompact,
              n < step && styles.dotCompleted,
              n === step && styles.dotActive,
              n > step && styles.dotInactive,
              compact && n > step && styles.dotInactiveCompact,
            ]}
          />
        ))}
      </View>
      <Text style={[styles.stepLabel, centered && styles.textCentered, compact && styles.stepLabelCompact]}>
        Step {step} of 3
      </Text>
      {title ? (
        <Text style={[styles.heading, centered && styles.textCentered, compact && styles.headingCompact]}>
          {title}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  progressSection: {
    gap: spacing.sm,
  },
  progressSectionCentered: {
    alignItems: 'center',
    gap: spacing.xxs,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  dotsRowCentered: {
    justifyContent: 'center',
    marginBottom: 0,
  },
  textCentered: {
    textAlign: 'center',
  },
  dot: {
    borderRadius: borderRadius.full,
  },
  dotCompleted: {
    width: 10,
    height: 10,
    backgroundColor: colors.primary,
    opacity: 0.5,
  },
  dotActive: {
    width: 10,
    height: 10,
    backgroundColor: colors.primary,
  },
  dotInactive: {
    width: 8,
    height: 8,
    backgroundColor: colors.taupe,
  },
  dotCompact: {
    width: 8,
    height: 8,
  },
  dotInactiveCompact: {
    width: 6,
    height: 6,
  },
  stepLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  stepLabelCompact: {
    fontSize: 11,
    lineHeight: 14,
  },
  heading: {
    ...typeScale.headingLg,
    letterSpacing: -0.5,
    color: colors.textPrimary,
  },
  headingCompact: {
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.4,
  },
});
