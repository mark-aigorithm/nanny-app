import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@mobile/components/ui/text';
import { Ionicons } from '@expo/vector-icons';
import type { BookingChild } from '@nanny-app/shared';
import { formatChildAge } from '@nanny-app/shared';

import { colors, borderRadius, shadows, spacing, typeScale } from '@mobile/theme';

interface Props {
  /** Named `bookingChildren`, not `children` — that prop name is React's. */
  bookingChildren: readonly BookingChild[];
}

/** The lines worth showing for one child, in the order a nanny plans a day. */
function detailLines(child: BookingChild): { label: string; value: string }[] {
  return [
    child.diet.length > 0 ? { label: 'Diet', value: child.diet.join(', ') } : null,
    child.languages.length > 0 ? { label: 'Speaks', value: child.languages.join(', ') } : null,
    child.interests.length > 0 ? { label: 'Loves', value: child.interests.join(', ') } : null,
    child.notes ? { label: 'Notes', value: child.notes } : null,
  ].filter((l): l is { label: string; value: string } => l != null);
}

/**
 * Who she's looking after, beyond the health warning (CareNotesCard has that):
 * what each child eats, speaks and loves, and the mother's note on them. Only
 * rendered when the mother filled any of it in. Names come off the booking,
 * which withholds them until the nanny holds it.
 */
export function ChildProfilesCard({ bookingChildren }: Props) {
  const rows = bookingChildren
    .map((child) => ({ child, lines: detailLines(child) }))
    .filter((r) => r.lines.length > 0);
  if (rows.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="happy-outline" size={18} color={colors.primary} />
        <Text style={styles.title}>About the children</Text>
      </View>
      {rows.map(({ child, lines }, i) => {
        const age = formatChildAge(child.ageYears, child.ageMonths);
        return (
          <View key={i} style={[styles.child, i > 0 && styles.divided]}>
            <Text style={styles.childName}>
              {child.name?.trim() ? `${child.name.trim()} · ${age}` : age}
            </Text>
            {lines.map((line) => (
              <Text key={line.label} style={styles.line}>
                <Text style={styles.lineLabel}>{line.label}: </Text>
                {line.value}
              </Text>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.warmBorder,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  child: {
    gap: spacing.xxs,
  },
  divided: {
    borderTopWidth: 1,
    borderTopColor: colors.warmSubtle,
    paddingTop: spacing.md,
  },
  childName: {
    ...typeScale.labelSm,
    color: colors.textPrimary,
  },
  line: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  lineLabel: {
    ...typeScale.bodySm,
    color: colors.textMuted,
  },
});
