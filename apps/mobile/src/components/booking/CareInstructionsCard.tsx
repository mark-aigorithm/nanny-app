import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BookingChild } from '@nanny-app/shared';
import { formatChildAge } from '@nanny-app/shared';

import { colors, borderRadius, shadows, spacing, typeScale } from '@mobile/theme';

interface Props {
  /** Named `bookingChildren`, not `children` — that prop name is React's. */
  bookingChildren: readonly BookingChild[];
  specialInstructions: string | null;
  nannyFirstName: string | null;
}

/**
 * What the nanny was told, read back to the mother in one place: each child
 * with their age and any allergy beside their name, then her own notes.
 *
 * The nanny's booking screen keeps CareNotesCard's loud ALLERGY WARNING — she
 * has to act on it. Here it is a calm summary the mother can check.
 */
export function CareInstructionsCard({
  bookingChildren,
  specialInstructions,
  nannyFirstName,
}: Props) {
  const notes = specialInstructions?.trim();
  if (bookingChildren.length === 0 && !notes) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Care instructions</Text>
      <View style={styles.card}>
        {bookingChildren.map((child, i) => {
          const allergies = child.allergies?.trim();
          const name = child.name?.trim();
          return (
            <View key={i} style={[styles.child, i > 0 && styles.divided]}>
              <View style={styles.initial}>
                {name ? (
                  <Text style={styles.initialText}>{name.charAt(0).toUpperCase()}</Text>
                ) : (
                  <Ionicons name="happy-outline" size={18} color={colors.primaryDark} />
                )}
              </View>
              <View style={styles.childText}>
                <Text style={styles.childName}>{name || formatChildAge(child.ageYears)}</Text>
                {name ? <Text style={styles.age}>{formatChildAge(child.ageYears)}</Text> : null}
              </View>
              {allergies ? (
                <View style={styles.allergy} accessibilityLabel={`Allergy: ${allergies}`}>
                  <Ionicons name="alert-circle" size={14} color={colors.error} />
                  <Text style={styles.allergyText} numberOfLines={2}>
                    {allergies}
                  </Text>
                </View>
              ) : (
                <Text style={styles.none}>No allergies</Text>
              )}
            </View>
          );
        })}

        {notes ? (
          <View style={[styles.notes, bookingChildren.length === 0 && styles.notesAlone]}>
            <Text style={styles.notesLabel}>Your notes to {nannyFirstName ?? 'your nanny'}</Text>
            <Text style={styles.notesText}>{notes}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  heading: {
    ...typeScale.headingMd,
    color: colors.textPrimary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.warmSubtle,
    overflow: 'hidden',
    ...shadows.sm,
  },
  child: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  divided: {
    borderTopWidth: 1,
    borderTopColor: colors.warmSubtle,
  },
  initial: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: {
    ...typeScale.labelLg,
    color: colors.primaryDark,
  },
  childText: {
    flex: 1,
    gap: spacing.xxs,
  },
  childName: {
    ...typeScale.labelLg,
    color: colors.textPrimary,
  },
  age: {
    ...typeScale.bodySm,
    color: colors.textMuted,
  },
  allergy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: '50%',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.errorLight,
  },
  allergyText: {
    ...typeScale.captionBold,
    color: colors.error,
    flexShrink: 1,
  },
  none: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  notes: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.warmSubtle,
    gap: spacing.xxs,
  },
  notesAlone: {
    marginTop: spacing.md,
  },
  notesLabel: {
    ...typeScale.captionBold,
    color: colors.textTertiary,
  },
  notesText: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
});
