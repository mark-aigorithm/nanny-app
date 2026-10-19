import React from 'react';
import { Modal, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@mobile/components/ui/text';
import type { MotherSurveySummary } from '@nanny-app/shared';

import { Button } from '@mobile/components/ui';
import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';
import {
  borderRadius,
  colors,
  fontFamily,
  screenPadding,
  shadows,
  spacing,
  typeScale,
} from '@mobile/theme';

type Props = {
  survey: MotherSurveySummary;
  onAnswer: () => void;
  onSkip: () => void;
  /** Android back: hide for this session without skipping. */
  onDismiss: () => void;
};

export default function SurveyPromptSheet({ survey, onAnswer, onSkip, onDismiss }: Props) {
  const bottomPadding = useBottomBarPadding(spacing['3xl']);
  const { height } = useWindowDimensions();
  const count = survey.questionCount;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      testID="survey-prompt-modal"
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { maxHeight: height * 0.9, paddingBottom: bottomPadding }]}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.handle} />
            <Text accessibilityRole="header" style={styles.title}>
              {survey.title}
            </Text>
            {survey.description ? <Text style={styles.body}>{survey.description}</Text> : null}
            <Text style={styles.meta}>
              {`${count} question${count === 1 ? '' : 's'}`}
            </Text>
            <Button title="Answer" onPress={onAnswer} />
            <Button title="Skip" variant="text" onPress={onSkip} style={styles.skip} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    ...shadows.lg,
  },
  content: {
    alignItems: 'stretch',
    paddingHorizontal: screenPadding,
    paddingTop: spacing.md,
    gap: spacing.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.warmBorder,
  },
  title: {
    ...typeScale.headingSm,
    fontFamily: fontFamily.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  body: { ...typeScale.bodyMd, color: colors.textSecondary, textAlign: 'center' },
  meta: { ...typeScale.bodyMd, color: colors.textMuted, textAlign: 'center' },
  skip: { minHeight: 44 },
});
