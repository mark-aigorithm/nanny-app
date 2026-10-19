import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { SurveyAnswerInput } from '@nanny-app/shared';
import { findSurveyAnswerProblem } from '@nanny-app/shared';

import SurveyQuestionInput from '@mobile/components/survey/SurveyQuestionInput';
import {
  Button,
  KeyboardAvoidingView,
  ScreenContainer,
  StackHeader,
} from '@mobile/components/ui';
import { Text } from '@mobile/components/ui/text';
import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';
import { useKeyboardVisible } from '@mobile/hooks/useKeyboardVisible';
import { useSkipSurvey, useSubmitSurvey, useSurvey } from '@mobile/hooks/useSurveys';
import { apiStatusOf, getApiErrorMessage } from '@mobile/lib/api';
import { noticeDialog } from '@mobile/store/confirmDialogStore';
import { colors, spacing } from '@mobile/theme';
import { styles } from './styles/survey-screen.styles';

/**
 * One survey, every question on one scroll. Submit stays disabled until the
 * required questions are answered (the same rule the backend enforces). A 409
 * (closed, or already answered) shows the server's message and leaves.
 */
export default function SurveyScreen() {
  const { surveyId } = useLocalSearchParams<{ surveyId: string }>();
  const id = Number(surveyId);
  const router = useRouter();
  const survey = useSurvey(id);
  const submit = useSubmitSurvey(id);
  const skip = useSkipSurvey();
  const [answers, setAnswers] = useState<Record<number, SurveyAnswerInput | undefined>>({});
  const [footerHeight, setFooterHeight] = useState(0);
  const keyboardVisible = useKeyboardVisible();
  const bottomPadding = useBottomBarPadding(spacing.lg);

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(parent)/(tabs)/home' as never);
  };

  const onMutationError = (err: Error) => {
    noticeDialog({ title: 'Could not send your answers', message: getApiErrorMessage(err) });
    if (apiStatusOf(err) === 409) leave();
  };

  if (survey.isPending && !survey.error) {
    return (
      <ScreenContainer useSafeArea={false}>
        <StackHeader title="Survey" onBack={leave} />
        <ActivityIndicator color={colors.primary} />
      </ScreenContainer>
    );
  }

  if (survey.error || !survey.data) {
    const closed = apiStatusOf(survey.error) === 409;
    return (
      <ScreenContainer useSafeArea={false}>
        <StackHeader title="Survey" onBack={leave} />
        <ScrollView contentContainerStyle={styles.message}>
          <Text style={styles.messageText}>
            {closed && survey.error instanceof Error
              ? survey.error.message
              : "We couldn't open this survey."}
          </Text>
          <Button title="Back" variant="outline" onPress={leave} />
        </ScrollView>
      </ScreenContainer>
    );
  }

  const given = Object.values(answers).filter((a): a is SurveyAnswerInput => a !== undefined);
  const problem = findSurveyAnswerProblem(survey.data.questions, given);
  const busy = submit.isPending || skip.isPending;

  return (
    <ScreenContainer useSafeArea={false}>
      <KeyboardAvoidingView style={styles.flex}>
        <StackHeader title={survey.data.title} onBack={leave} />
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: footerHeight + spacing.lg }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {survey.data.description ? (
            <Text style={styles.description}>{survey.data.description}</Text>
          ) : null}
          {survey.data.questions.map((q, i) => (
            <View key={q.id} style={styles.question}>
              <Text style={styles.prompt}>
                {i + 1}. {q.prompt}
                {q.required ? '' : <Text style={styles.optional}> (optional)</Text>}
              </Text>
              <SurveyQuestionInput
                question={q}
                answer={answers[q.id]}
                onChange={(a) => setAnswers((prev) => ({ ...prev, [q.id]: a }))}
              />
            </View>
          ))}
        </ScrollView>
        <View
          style={[styles.footer, { paddingBottom: keyboardVisible ? spacing.md : bottomPadding }]}
          onLayout={(e: LayoutChangeEvent) => setFooterHeight(e.nativeEvent.layout.height)}
        >
          <Button
            title="Submit"
            disabled={problem !== null || busy}
            loading={submit.isPending}
            onPress={() => submit.mutate(given, { onSuccess: leave, onError: onMutationError })}
          />
          <Button
            title="Skip for now"
            variant="text"
            disabled={busy}
            style={styles.skipButton}
            onPress={() => skip.mutate(id, { onSuccess: leave, onError: onMutationError })}
          />
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
