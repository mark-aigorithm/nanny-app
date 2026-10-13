import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@mobile/components/ui/text';

import { Button, Chip, TextInputField } from '@mobile/components/ui';
import { colors, spacing, typeScale } from '@mobile/theme';

type Props = {
  label: string;
  hint?: string;
  /** One-tap answers. Anything else goes in through "Other". */
  presets: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
  otherPlaceholder: string;
  /** Prefix for the "Other" field and its Add button: `<id>.other`, `<id>.add`. */
  testID: string;
};

const MAX_TAG_LENGTH = 40;

const sameTag = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * A chip list with presets plus free text. Tapping a preset toggles it; "Other"
 * opens a field whose entry becomes a chip of its own, shown selected with an ×
 * to remove it. Stored values are the labels as shown, so a typed "Cats" and a
 * preset read the same wherever they appear later.
 */
export default function ChipGroupInput({
  label,
  hint,
  presets,
  value,
  onChange,
  otherPlaceholder,
  testID,
}: Props) {
  const [otherOpen, setOtherOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const custom = value.filter((v) => !presets.some((p) => sameTag(p, v)));
  const isOn = (tag: string) => value.some((v) => sameTag(v, tag));

  const toggle = (tag: string) =>
    onChange(isOn(tag) ? value.filter((v) => !sameTag(v, tag)) : [...value, tag]);

  const addDraft = () => {
    const tag = draft.trim();
    if (tag && !isOn(tag)) onChange([...value, tag]);
    setDraft('');
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={styles.chips}>
        {presets.map((tag) => (
          <Chip
            key={tag}
            label={tag}
            active={isOn(tag)}
            onPress={() => toggle(tag)}
            inactiveColor={colors.taupeLight}
            style={styles.chip}
          />
        ))}
        {custom.map((tag) => (
          <Chip
            key={`custom-${tag}`}
            label={tag}
            active
            dismissible
            onDismiss={() => toggle(tag)}
            onPress={() => toggle(tag)}
            style={styles.chip}
          />
        ))}
        <Chip
          label="+ Other"
          active={otherOpen}
          onPress={() => setOtherOpen((open) => !open)}
          inactiveColor={colors.taupeLight}
          style={styles.chip}
        />
      </View>
      {otherOpen && (
        <View style={styles.otherRow}>
          <TextInputField
            containerStyle={styles.otherField}
            placeholder={otherPlaceholder}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={addDraft}
            submitBehavior="submit"
            returnKeyType="done"
            maxLength={MAX_TAG_LENGTH}
            autoCapitalize="sentences"
            testID={`${testID}.other`}
          />
          <Button
            title="Add"
            size="sm"
            variant="secondary"
            onPress={addDraft}
            disabled={draft.trim().length === 0}
            fullWidth={false}
            style={styles.addBtn}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  // 44dp: the tap-target floor from the UI sweep rules.
  chip: {
    minHeight: 44,
  },
  otherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  otherField: {
    flex: 1,
  },
  addBtn: {
    minHeight: 44,
  },
});
