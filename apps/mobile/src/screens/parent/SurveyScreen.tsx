import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
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
import { markSurveyPrompted } from '@mobile/store/surveyPromptStore';
import { colors, spacing } from '@mobile/theme';
import { styles } from './styles/survey-screen.styles';

/**
 * One survey, every question on one scroll. Submit stays disabled until the
 * required questions are answered (the same rule the backend enforces). A 409
 * (closed, or already answered) shows the server's message as an end state with Back.
 */
export default function SurveyScreen() {
  const { surveyId } = useLocalSearchParams<{ surveyId: string }>();
  const id = Number(surveyId);
  const router = useRouter();
  const survey = useSurvey(id);
  const submit = useSubmitSurvey(id);
  const skip = useSkipSurvey();
  const [answers, setAnswers] = useState<Record<number, SurveyAnswerInput | undefined>>({});
  const [done, setDone] = useState(false);
  const keyboardVisible = useKeyboardVisible();
  const bottomPadding = useBottomBarPadding(spacing.lg);

  // Opened at all (deep link, profile list, push), she has seen it: the prompt
  // sheet must not offer it on top of this screen or after she leaves.
  useEffect(() => {
    if (Number.isFinite(id) && id > 0) markSurveyPrompted(id);
  }, [id]);

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(parent)/(tabs)/home' as never);
  };

  // A non-409 failure keeps the form so she can retry; a 409 is an end state below.
  const onMutationError = (err: Error) => {
    if (apiStatusOf(err) === 409) return;
    noticeDialog({ title: 'Could not send your answers', message: getApiErrorMessage(err) });
  };

  if (!Number.isFinite(id) || id <= 0) {
    return (
      <ScreenContainer useSafeArea={false}>
        <StackHeader title="Survey" onBack={leave} />
        <ScrollView contentContainerStyle={styles.message}>
          <Text style={styles.messageText}>We couldn't open this survey.</Text>
          <Button title="Back" variant="outline" onPress={leave} />
        </ScrollView>
      </ScreenContainer>
    );
  }

  const endError = [survey.error, submit.error, skip.error].find((e) => apiStatusOf(e) === 409);
  if (endError instanceof Error) {
    return (
      <ScreenContainer useSafeArea={false}>
        <StackHeader title="Survey" onBack={leave} />
        <ScrollView contentContainerStyle={styles.message}>
          <Text style={styles.messageText}>{endError.message}</Text>
          <Button title="Back" variant="outline" onPress={leave} />
        </ScrollView>
      </ScreenContainer>
    );
  }

  if (done) {
    return (
      <ScreenContainer useSafeArea={false}>
        <StackHeader title="Thank you!" showBackButton={false} />
        <ScrollView contentContainerStyle={styles.message}>
          <Text style={styles.messageText}>Your answers help us look after your family better.</Text>
          <Button title="Done" onPress={leave} />
        </ScrollView>
      </ScreenContainer>
    );
  }

  if (survey.isPending && !survey.error) {
    return (
      <ScreenContainer useSafeArea={false}>
        <StackHeader title="Survey" onBack={leave} />
        <ActivityIndicator color={colors.primary} />
      </ScreenContainer>
    );
  }

  if (survey.error || !survey.data) {
    return (
      <ScreenContainer useSafeArea={false}>
        <StackHeader title="Survey" onBack={leave} />
        <ScrollView contentContainerStyle={styles.message}>
          <Text style={styles.messageText}>
            We couldn't open this survey.
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
        {/* The header's title stops at two lines; a survey title can run to 120
            characters, so it wraps in full at the top of the scroll instead. */}
        <StackHeader title="Survey" onBack={leave} />
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: spacing.lg }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text accessibilityRole="header" style={styles.title}>
            {survey.data.title}
          </Text>
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
        >
          <Button
            title="Submit"
            disabled={problem !== null || busy}
            loading={submit.isPending}
            onPress={() => submit.mutate(given, { onSuccess: () => setDone(true), onError: onMutationError })}
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
