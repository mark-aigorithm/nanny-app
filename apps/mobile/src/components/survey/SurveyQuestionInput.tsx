import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SurveyAnswerInput, SurveyQuestion } from '@nanny-app/shared';
import { SURVEY_TEXT_ANSWER_MAX } from '@nanny-app/shared';

import { PressableScale, StarRatingInput } from '@mobile/components/ui';
import { Text, TextInput } from '@mobile/components/ui/text';
import { borderRadius, colors, fontFamily, spacing, typeScale } from '@mobile/theme';

type Props = {
  question: SurveyQuestion;
  answer: SurveyAnswerInput | undefined;
  onChange: (answer: SurveyAnswerInput | undefined) => void;
  /** A text answer took focus (the screen scrolls its prompt into view). */
  onTextFocus?: () => void;
  onTextBlur?: () => void;
};

function Choice({
  label,
  selected,
  role,
  onPress,
}: {
  label: string;
  selected: boolean;
  role: 'radio' | 'checkbox';
  onPress: () => void;
}) {
  // The glyph shows sighted users whether they may pick one or several; the
  // role already says so to a screen reader, so the glyph is hidden from it.
  const glyph =
    role === 'checkbox'
      ? selected
        ? 'checkbox'
        : 'square-outline'
      : selected
        ? 'radio-button-on'
        : 'radio-button-off';
  return (
    <PressableScale
      haptic="select"
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected]}
    >
      <View importantForAccessibility="no" accessibilityElementsHidden>
        <Ionicons name={glyph} size={22} color={selected ? colors.primaryDark : colors.textMuted} />
      </View>
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </PressableScale>
  );
}

/** One control per question type; every control carries a role and a label. */
export default function SurveyQuestionInput({ question, answer, onChange, onTextFocus, onTextBlur }: Props) {
  const id = question.id;
  switch (question.type) {
    case 'TEXT':
      return (
        <TextInput
          accessibilityLabel={question.prompt}
          multiline
          maxLength={SURVEY_TEXT_ANSWER_MAX}
          value={answer?.text ?? ''}
          onChangeText={(text) => onChange(text ? { questionId: id, text } : undefined)}
          onFocus={onTextFocus}
          onBlur={onTextBlur}
          placeholder="Type your answer"
          placeholderTextColor={colors.textPlaceholder}
          style={styles.text}
        />
      );
    case 'YES_NO':
      return (
        <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={question.prompt}>
          {[true, false].map((value) => (
            <Choice
              key={String(value)}
              role="radio"
              label={value ? 'Yes' : 'No'}
              selected={answer?.bool === value}
              onPress={() => onChange({ questionId: id, bool: value })}
            />
          ))}
        </View>
      );
    case 'RATING':
      return (
        <StarRatingInput
          align="start"
          accessibilityLabel={question.prompt}
          rating={answer?.rating ?? 0}
          onChange={(rating) => onChange({ questionId: id, rating })}
        />
      );
    case 'SINGLE_CHOICE':
    case 'MULTI_CHOICE': {
      const multi = question.type === 'MULTI_CHOICE';
      const picked = answer?.optionIds ?? [];
      const toggle = (optionId: number) => {
        const next = multi
          ? picked.includes(optionId)
            ? picked.filter((p) => p !== optionId)
            : [...picked, optionId]
          : [optionId];
        onChange(next.length ? { questionId: id, optionIds: next } : undefined);
      };
      return (
        <View
          style={styles.column}
          accessibilityRole={multi ? undefined : 'radiogroup'}
          accessibilityLabel={question.prompt}
        >
          {multi ? <Text style={styles.helper}>Choose all that apply</Text> : null}
          {question.options.map((o) => (
            <Choice
              key={o.id}
              role={multi ? 'checkbox' : 'radio'}
              label={o.label}
              selected={picked.includes(o.id)}
              onPress={() => toggle(o.id)}
            />
          ))}
        </View>
      );
    }
  }
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  column: { gap: spacing.sm },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    // 4.1:1 on cream: an unpicked option reads as a control (warmBorder was 1.3:1).
    borderColor: colors.textMuted,
    backgroundColor: colors.surface,
  },
  choiceSelected: { borderColor: colors.primaryDark, backgroundColor: colors.primaryMuted },
  choiceText: { ...typeScale.bodyLg, color: colors.textPrimary, flexShrink: 1 },
  // Picked reads stronger than unpicked, never paler (the UI sweep caught it looking disabled).
  choiceTextSelected: { color: colors.textPrimary, fontFamily: fontFamily.semiBold },
  helper: { ...typeScale.bodyMd, color: colors.textSecondary },
  text: {
    ...typeScale.bodyLg,
    minHeight: 96,
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    padding: spacing.md,
    textAlignVertical: 'top',
  },
});
