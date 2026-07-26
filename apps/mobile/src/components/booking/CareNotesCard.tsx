import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BookingChild } from '@nanny-app/shared';
import { childrenWithAllergies, formatChildAge } from '@nanny-app/shared';

import { colors, spacing, borderRadius, typeScale, shadows } from '@mobile/theme';

interface Props {
  /** Named `bookingChildren`, not `children` — that prop name is React's. */
  bookingChildren: readonly BookingChild[];
  specialInstructions: string | null;
  /**
   * The nanny is the one who has to act on this, so she gets the loud version:
   * a red-bordered ALLERGY WARNING she can't skim past. The mother is reading
   * back what she typed, so hers is a calm summary.
   */
  emphasis: 'warning' | 'summary';
}

/**
 * Allergies and the parent's notes, on a booking detail screen.
 *
 * These used to be visible nowhere in the mobile app: a mother could type
 * "Liam is allergic to peanuts" into the booking form and no nanny would ever
 * see it. Allergies now have their own field and lead the card; the free-text
 * notes follow, because the two answer different questions and burying the
 * first inside the second is what caused the gap.
 */
export function CareNotesCard({ bookingChildren, specialInstructions, emphasis }: Props) {
  const allergic = childrenWithAllergies(bookingChildren);
  const notes = specialInstructions?.trim();
  if (allergic.length === 0 && !notes) return null;

  const isWarning = emphasis === 'warning';

  return (
    <View style={styles.wrap}>
      {allergic.length > 0 ? (
        <View style={[styles.card, isWarning ? styles.cardWarning : styles.cardSummary]}>
          <View style={styles.head}>
            <Ionicons
              name="warning"
              size={18}
              color={isWarning ? colors.error : colors.goldWarm}
            />
            <Text style={[styles.title, isWarning && styles.titleWarning]}>
              {isWarning ? 'ALLERGY WARNING' : 'Allergies'}
            </Text>
          </View>

          {allergic.map((child, i) => (
            <View key={i} style={styles.childRow}>
              <Text style={styles.childName}>
                {child.name?.trim() || formatChildAge(child.ageYears)}
              </Text>
              <Text style={styles.allergy}>{child.allergies}</Text>
            </View>
          ))}

          {isWarning ? (
            <Text style={styles.note}>
              Check every food and product before giving it to them. Call the parent if
              you are unsure.
            </Text>
          ) : null}
        </View>
      ) : null}

      {notes ? (
        <View style={[styles.card, styles.cardSummary]}>
          <View style={styles.head}>
            <Ionicons name="document-text-outline" size={18} color={colors.primary} />
            <Text style={styles.title}>
              {isWarning ? 'Notes from the parent' : 'Your notes'}
            </Text>
          </View>
          <Text style={styles.notesBody}>{notes}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    ...shadows.sm,
  },
  cardWarning: {
    borderColor: colors.error,
    backgroundColor: colors.errorLight,
  },
  cardSummary: {
    borderColor: colors.warmBorder,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  titleWarning: {
    ...typeScale.labelMd,
    color: colors.error,
    letterSpacing: 0.8,
  },
  childRow: {
    gap: 2,
  },
  childName: {
    ...typeScale.labelSm,
    color: colors.textSecondary,
  },
  allergy: {
    ...typeScale.bodyMd,
    color: colors.textPrimary,
  },
  note: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  notesBody: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
