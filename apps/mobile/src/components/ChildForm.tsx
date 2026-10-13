import React, { useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@mobile/components/ui/text';
import { Ionicons } from '@expo/vector-icons';
import {
  CHILD_ALLERGY_PRESETS,
  CHILD_CONDITION_PRESETS,
  CHILD_DIET_PRESETS,
  CHILD_INTEREST_PRESETS,
  CHILD_LANGUAGE_PRESETS,
  ChildInputSchema,
  childAgeOn,
  formatChildAge,
  toYearMonth,
  type Child,
  type ChildInput,
} from '@nanny-app/shared';

import { Button, Stepper, TextInputField } from '@mobile/components/ui';
import ChipGroupInput from '@mobile/components/ChipGroupInput';
import { borderRadius, colors, spacing, typeScale } from '@mobile/theme';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Matches ChildInputSchema: no older than 17. */
const MAX_AGE_YEARS = 17;

/**
 * Where the birth-month steppers start for a new child: three years back. A
 * visible default she adjusts beats an empty picker — and the age line under it
 * says what it means, so nothing is saved that she hasn't seen.
 */
const DEFAULT_AGE_YEARS = 3;

type Props = {
  /** Edit mode: prefills every field. Omit to add a new child. */
  initial?: Child;
  onSubmit: (input: ChildInput) => void;
  submitting?: boolean;
  /** A server-side failure to show under the button. */
  error?: string | null;
};

function splitMonth(yearMonth: string): { year: number; month: number } {
  const [y, m] = yearMonth.split('-').map(Number);
  return { year: y ?? 0, month: m ?? 1 };
}

/**
 * One child: name and birth month (both required), then the optional details a
 * nanny needs — allergies, medical conditions and medicines, diet, interests,
 * languages and a free note. Every chip list has presets plus "Other".
 */
export default function ChildForm({ initial, onSubmit, submitting, error }: Props) {
  const today = useMemo(() => splitMonth(toYearMonth(new Date())), []);
  const start = initial?.birthMonth
    ? splitMonth(initial.birthMonth)
    : // An older build's child has only an age: start from the year it implies.
      { year: today.year - (initial?.ageYears ?? DEFAULT_AGE_YEARS), month: today.month };

  const [name, setName] = useState(initial?.name ?? '');
  const [year, setYear] = useState(start.year);
  const [month, setMonth] = useState(start.month);
  const [allergies, setAllergies] = useState<string[]>(initial?.allergies ?? []);
  const [conditions, setConditions] = useState<string[]>(initial?.conditions ?? []);
  const [healthNotes, setHealthNotes] = useState(initial?.healthNotes ?? '');
  const [diet, setDiet] = useState<string[]>(initial?.diet ?? []);
  const [interests, setInterests] = useState<string[]>(initial?.interests ?? []);
  const [languages, setLanguages] = useState<string[]>(initial?.languages ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // This year's months stop at the current one: a birth month can't be ahead.
  const maxMonth = year === today.year ? today.month : 12;
  const safeMonth = Math.min(month, maxMonth);
  const birthMonth = `${year}-${String(safeMonth).padStart(2, '0')}`;
  const age = childAgeOn(birthMonth, toYearMonth(new Date()));
  const firstName = name.trim().split(/\s+/)[0];

  const handleSubmit = () => {
    const parsed = ChildInputSchema.safeParse({
      name,
      birthMonth,
      allergies,
      conditions,
      healthNotes: healthNotes.trim() || null,
      diet,
      interests,
      languages,
      notes: notes.trim() || null,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        next[key] ??= issue.message;
      }
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});
    onSubmit(parsed.data);
  };

  return (
    <View style={styles.form}>
      <TextInputField
        label="Name"
        placeholder="Child’s name"
        value={name}
        onChangeText={(text) => {
          setName(text);
          setFieldErrors(({ name: _name, ...rest }) => rest);
        }}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={80}
        error={fieldErrors['name'] ?? null}
        testID="childForm.name"
      />

      {/* Month and year rather than an age: the age is worked out on each
          booking's date, so it never goes stale. */}
      <View style={styles.section}>
        <Text style={styles.label}>Born in</Text>
        <View style={styles.birthRow}>
          <Text style={styles.birthLabel}>Month</Text>
          <Stepper
            value={safeMonth}
            onChange={setMonth}
            min={1}
            max={maxMonth}
            formatValue={(m) => MONTHS[m - 1] ?? ''}
            size="sm"
            testID="childForm.month"
          />
        </View>
        <View style={styles.birthRow}>
          <Text style={styles.birthLabel}>Year</Text>
          <Stepper
            value={year}
            onChange={setYear}
            min={today.year - MAX_AGE_YEARS}
            max={today.year}
            formatValue={String}
            size="sm"
            testID="childForm.year"
          />
        </View>
        <Text style={styles.ageLine} accessibilityLiveRegion="polite">
          {firstName ? `${firstName} is` : 'Age:'} {formatChildAge(age.ageYears, age.ageMonths)}
        </Text>
        {fieldErrors['birthMonth'] ? (
          <Text style={styles.error}>{fieldErrors['birthMonth']}</Text>
        ) : null}
      </View>

      <View style={styles.healthCard}>
        <View style={styles.section}>
          <View style={styles.healthHead}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
            <Text style={styles.healthTitle}>Health</Text>
          </View>
          <Text style={styles.hint}>Your nanny sees this as a warning before she arrives.</Text>
        </View>
        <ChipGroupInput
          label="Allergies"
          presets={CHILD_ALLERGY_PRESETS}
          value={allergies}
          onChange={setAllergies}
          otherPlaceholder="e.g. Kiwi"
          testID="childForm.allergies"
        />
        <ChipGroupInput
          label="Medical conditions"
          presets={CHILD_CONDITION_PRESETS}
          value={conditions}
          onChange={setConditions}
          otherPlaceholder="e.g. Anemia"
          testID="childForm.conditions"
        />
        <TextInputField
          label="Medicines and what to do"
          placeholder="e.g. Inhaler in the blue bag, two puffs if wheezy"
          value={healthNotes}
          onChangeText={setHealthNotes}
          multiline
          maxLength={500}
          error={fieldErrors['healthNotes'] ?? null}
          testID="childForm.healthNotes"
        />
      </View>

      <ChipGroupInput
        label="Diet"
        presets={CHILD_DIET_PRESETS}
        value={diet}
        onChange={setDiet}
        otherPlaceholder="e.g. Vegan"
        testID="childForm.diet"
      />
      <ChipGroupInput
        label="Interests and hobbies"
        hint="Gives your nanny ideas for the day."
        presets={CHILD_INTEREST_PRESETS}
        value={interests}
        onChange={setInterests}
        otherPlaceholder="e.g. Trains"
        testID="childForm.interests"
      />
      <ChipGroupInput
        label="Languages spoken"
        presets={CHILD_LANGUAGE_PRESETS}
        value={languages}
        onChange={setLanguages}
        otherPlaceholder="e.g. Italian"
        testID="childForm.languages"
      />
      <TextInputField
        label="Notes for the nanny"
        placeholder="Comfort toy, nap habits, what calms them down"
        value={notes}
        onChangeText={setNotes}
        multiline
        maxLength={500}
        error={fieldErrors['notes'] ?? null}
        testID="childForm.notes"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {Object.keys(fieldErrors).length > 0 ? (
        <Text style={styles.error}>Check the fields marked above.</Text>
      ) : null}

      <Button
        title={initial ? 'Save changes' : 'Save child'}
        onPress={handleSubmit}
        loading={submitting}
        disabled={submitting}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  label: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  hint: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  birthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 44,
  },
  birthLabel: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  ageLine: {
    ...typeScale.labelSm,
    color: colors.primaryDark,
  },
  healthCard: {
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.errorLight,
    backgroundColor: colors.surface,
  },
  healthHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  healthTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  error: {
    ...typeScale.bodySm,
    color: colors.error,
  },
});
