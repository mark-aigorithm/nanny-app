import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@mobile/components/ui/text';
import type { MotherSurveySummary } from '@nanny-app/shared';

import { Button, SlideUpSheet } from '@mobile/components/ui';
import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';
import {
  STATUS_BAR_HEIGHT,
  colors,
  fontFamily,
  screenPadding,
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
  const count = survey.questionCount;
  // The choice made: the sheet slides away first, then it runs.
  const [pending, setPending] = useState<(() => void) | null>(null);
  const choose = (action: () => void) => () => setPending(() => action);

  // No grab handle: the sheet has no swipe to dismiss, so it would promise one.
  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={choose(onDismiss)}
      testID="survey-prompt-modal"
    >
      <SlideUpSheet
        closing={pending !== null}
        onClosed={() => pending?.()}
        onBackdropPress={choose(onDismiss)}
        backdropLabel="Not now"
        style={{ maxHeight: height - STATUS_BAR_HEIGHT, paddingBottom: bottomPadding }}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text accessibilityRole="header" style={styles.title}>
            {survey.title}
          </Text>
          <Text style={styles.meta}>
            {`${count} question${count === 1 ? '' : 's'}`}
          </Text>
          <Button title="Answer" onPress={choose(onAnswer)} />
          <View style={styles.skipGroup}>
            <Button title="Skip" variant="text" onPress={choose(onSkip)} style={styles.skip} />
            <Text style={styles.note}>You can answer it later from Account → Surveys.</Text>
          </View>
        </ScrollView>
      </SlideUpSheet>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  // textMuted was 4.29:1 on white; meta text needs 4.5.
  meta: { ...typeScale.bodyMd, color: colors.textSecondary, textAlign: 'center' },
  skipGroup: { gap: spacing.xxs },
  skip: { minHeight: 44 },
  note: { ...typeScale.bodySm, color: colors.textSecondary, textAlign: 'center' },
});
