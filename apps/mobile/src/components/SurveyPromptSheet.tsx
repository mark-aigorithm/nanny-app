import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@mobile/components/ui/text';
import type { MotherSurveySummary } from '@nanny-app/shared';

import { Button } from '@mobile/components/ui';
import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';
import { useReducedMotion } from '@mobile/hooks/useReducedMotion';
import {
  STATUS_BAR_HEIGHT,
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
  /** Android back or a tap on the scrim: hide for this session without skipping. */
  onDismiss: () => void;
};

export default function SurveyPromptSheet({ survey, onAnswer, onSkip, onDismiss }: Props) {
  const bottomPadding = useBottomBarPadding(spacing['3xl']);
  const { height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const count = survey.questionCount;

  // No grab handle: the sheet has no swipe to dismiss, so it would promise one.
  return (
    <Modal
      visible
      transparent
      animationType={reducedMotion ? 'fade' : 'slide'}
      onRequestClose={onDismiss}
      testID="survey-prompt-modal"
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Not now"
        />
        <View
          style={[
            styles.sheet,
            { maxHeight: height - STATUS_BAR_HEIGHT, paddingBottom: bottomPadding },
          ]}
        >
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Text accessibilityRole="header" style={styles.title}>
              {survey.title}
            </Text>
            {survey.description ? <Text style={styles.body}>{survey.description}</Text> : null}
            <Text style={styles.meta}>
              {`${count} question${count === 1 ? '' : 's'}`}
            </Text>
            <Button title="Answer" onPress={onAnswer} />
            <View style={styles.skipGroup}>
              <Button title="Skip" variant="text" onPress={onSkip} style={styles.skip} />
              <Text style={styles.note}>You can answer it later from Account → Surveys.</Text>
            </View>
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
    paddingTop: spacing['2xl'],
    gap: spacing.lg,
  },
  title: {
    ...typeScale.headingSm,
    fontFamily: fontFamily.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  body: { ...typeScale.bodyMd, color: colors.textSecondary, textAlign: 'center' },
  // textMuted was 4.29:1 on white; meta text needs 4.5.
  meta: { ...typeScale.bodyMd, color: colors.textSecondary, textAlign: 'center' },
  skipGroup: { gap: spacing.xxs },
  skip: { minHeight: 44 },
  note: { ...typeScale.bodySm, color: colors.textSecondary, textAlign: 'center' },
});
