import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { SurveyAnswerInput, SurveyQuestion } from '@nanny-app/shared';
import { findSurveyAnswerProblem, hasAnswerValue } from '@nanny-app/shared';

import SurveyQuestionInput from '@mobile/components/survey/SurveyQuestionInput';
import {
  Button,
  IconCircle,
  KeyboardAvoidingView,
  ScreenContainer,
  StackHeader,
} from '@mobile/components/ui';
import { Text } from '@mobile/components/ui/text';
import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';
import { useKeyboardVisible } from '@mobile/hooks/useKeyboardVisible';
import {
  usePendingSurveys,
  useSkipSurvey,
  useSubmitSurvey,
  useSurvey,
} from '@mobile/hooks/useSurveys';
import { apiStatusOf, getApiErrorMessage } from '@mobile/lib/api';
import { noticeDialog } from '@mobile/store/confirmDialogStore';
import { markSurveyPrompted } from '@mobile/store/surveyPromptStore';
import { colors, spacing } from '@mobile/theme';
import { styles } from './styles/survey-screen.styles';

const HOME = '/(parent)/(tabs)/home';
const SURVEYS = '/(parent)/surveys';

/**
 * Why Submit is disabled, in her words: which required question is left, or
 * how many. Null once every required question has an answer.
 */
function submitHint(
  questions: SurveyQuestion[],
  answers: Record<number, SurveyAnswerInput | undefined>,
): string | null {
  const left = questions.flatMap((q, i) =>
    q.required && !hasAnswerValue(q.type, answers[q.id]) ? [i + 1] : [],
  );
  if (left.length === 0) return null;
  if (left.length === 1) return `Answer question ${left[0]} to send`;
  return `Answer the ${left.length} required questions to send`;
}

/**
 * The icon above an end state's message, in the thank-you screen's place:
 * muted, since nothing here is a success or an error she can fix.
 */
function EndIcon({ icon }: { icon: 'lock-closed-outline' | 'alert-circle-outline' }) {
  return (
    <IconCircle
      icon={icon}
      size="xl"
      backgroundColor={colors.surfaceMuted}
      iconColor={colors.textSecondary}
    />
  );
}

/**
 * One survey, every question on one scroll. Submit stays disabled until the
 * required questions are answered (the same rule the backend enforces), and a
 * line above it says which are left. A 409 (closed, or already answered) shows
 * the server's message as an end state that leads to her other surveys or home.
 */
export default function SurveyScreen() {
  const { surveyId } = useLocalSearchParams<{ surveyId: string }>();
  const id = Number(surveyId);
  const router = useRouter();
  const survey = useSurvey(id);
  const submit = useSubmitSurvey(id);
  const skip = useSkipSurvey();
  const pending = usePendingSurveys();
  const [answers, setAnswers] = useState<Record<number, SurveyAnswerInput | undefined>>({});
  const [done, setDone] = useState(false);
  const keyboardVisible = useKeyboardVisible();
  const bottomPadding = useBottomBarPadding(spacing.lg);
  const scrollRef = useRef<ScrollView>(null);
  // Each question's top in the scroll, so a focused text answer brings its
  // prompt into view rather than only the field.
  const questionTops = useRef<Record<number, number>>({});
  const [scrolled, setScrolled] = useState(false);
  // The text question being typed in. When the keyboard shrinks the scroll,
  // Android scrolls the field into view and the prompt above it is cut off,
  // so the scroll re-aims at the question once its new height lands.
  const focusedQuestion = useRef<number | null>(null);

  // Opened at all (deep link, profile list, push), she has seen it: the prompt
  // sheet must not offer it on top of this screen or after she leaves.
  useEffect(() => {
    if (Number.isFinite(id) && id > 0) markSurveyPrompted(id);
  }, [id]);

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace(HOME as never);
  };
  // dismissTo pops back to the route when it is underneath, else replaces this one.
  const goHome = () => router.dismissTo(HOME as never);
  const goToSurveys = () => router.dismissTo(SURVEYS as never);
  const othersWaiting = (pending.data ?? []).some((s) => s.id !== id);

  const endError = [survey.error, submit.error, skip.error].find((e) => apiStatusOf(e) === 409);
  const endMessage =
    endError instanceof Error
      ? endError === submit.error
        ? `We couldn't send your answers. ${endError.message}`
        : endError.message
      : null;

  // The focused Submit or Skip unmounts when the screen swaps to an end state,
  // so a screen reader would land on nothing; say what happened.
  useEffect(() => {
    if (done) AccessibilityInfo.announceForAccessibility('Thank you! Your answers were sent.');
  }, [done]);
  useEffect(() => {
    if (endMessage) AccessibilityInfo.announceForAccessibility(endMessage);
  }, [endMessage]);

  // A non-409 failure keeps the form so she can retry; a 409 is an end state below.
  const onMutationError = (err: Error) => {
    if (apiStatusOf(err) === 409) return;
    noticeDialog({ title: 'Could not send your answers', message: getApiErrorMessage(err) });
  };

  if (!Number.isFinite(id) || id <= 0) {
    return (
      <ScreenContainer useSafeArea={false}>
        <StackHeader onBack={leave} />
        <ScrollView contentContainerStyle={styles.message}>
          <EndIcon icon="alert-circle-outline" />
          <Text style={styles.messageText}>We couldn't open this survey.</Text>
          <Button title="Back to home" onPress={goHome} style={styles.messageAction} />
        </ScrollView>
      </ScreenContainer>
    );
  }

  // The header chevron is the plain back; the button says where it goes.
  const endAction = othersWaiting ? (
    <Button title="See your surveys" onPress={goToSurveys} style={styles.messageAction} />
  ) : (
    <Button title="Back to home" onPress={goHome} style={styles.messageAction} />
  );

  if (endMessage) {
    return (
      <ScreenContainer useSafeArea={false}>
        <StackHeader onBack={leave} />
        <ScrollView contentContainerStyle={styles.message}>
          {/* Closed, or already answered: either way it's no longer open to her. */}
          <EndIcon icon="lock-closed-outline" />
          <Text style={styles.messageText} accessibilityLiveRegion="polite">
            {endMessage}
          </Text>
          {endAction}
        </ScrollView>
      </ScreenContainer>
    );
  }

  if (done) {
    // Centred on its own: no title in the header, nothing to go back to.
    return (
      <ScreenContainer useSafeArea={false}>
        <StackHeader showBackButton={false} />
        <ScrollView contentContainerStyle={[styles.message, { paddingBottom: bottomPadding }]}>
          <IconCircle
            icon="checkmark"
            size="xl"
            backgroundColor={colors.successLight}
            iconColor={colors.successText}
          />
          <View style={styles.thanksText}>
            <Text accessibilityRole="header" style={styles.thanksTitle}>
              Thank you!
            </Text>
            <Text style={styles.messageText} accessibilityLiveRegion="polite">
              Your answers help us look after your family better.
            </Text>
          </View>
          <Button title="Done" onPress={leave} style={styles.messageAction} />
        </ScrollView>
      </ScreenContainer>
    );
  }

  if (survey.isPending && !survey.error) {
    return (
      <ScreenContainer useSafeArea={false}>
        <StackHeader onBack={leave} />
        <View style={styles.message}>
          <ActivityIndicator color={colors.primaryDark} accessibilityLabel="Loading survey" />
        </View>
      </ScreenContainer>
    );
  }

  if (survey.error || !survey.data) {
    return (
      <ScreenContainer useSafeArea={false}>
        <StackHeader onBack={leave} />
        <ScrollView contentContainerStyle={styles.message}>
          <EndIcon icon="alert-circle-outline" />
          <Text style={styles.messageText}>
            We couldn't open this survey.
          </Text>
          {endAction}
        </ScrollView>
      </ScreenContainer>
    );
  }

  const given = Object.values(answers).filter((a): a is SurveyAnswerInput => a !== undefined);
  const problem = findSurveyAnswerProblem(survey.data.questions, given);
  const hint = problem === null ? null : (submitHint(survey.data.questions, answers) ?? problem);
  const busy = submit.isPending || skip.isPending;

  const showQuestion = (questionId: number) => {
    const top = questionTops.current[questionId];
    if (top !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, top - spacing.xs), animated: true });
  };

  return (
    <ScreenContainer useSafeArea={false}>
      <KeyboardAvoidingView style={styles.flex}>
        {/* The survey's own title is the screen's title. The header's title stops
            at two lines and a survey title can run to 120 characters, so the
            header carries only the chevron and the title wraps in full below. */}
        <StackHeader onBack={leave} scrolled={scrolled} />
        <ScrollView
          ref={scrollRef}
          onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 0)}
          onLayout={() => {
            if (focusedQuestion.current !== null) showQuestion(focusedQuestion.current);
          }}
          scrollEventThrottle={16}
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: spacing.lg }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text accessibilityRole="header" style={styles.title}>
            {survey.data.title}
          </Text>
          {survey.data.questions.map((q, i) => (
            <View
              key={q.id}
              style={styles.question}
              onLayout={(e) => {
                questionTops.current[q.id] = e.nativeEvent.layout.y;
              }}
            >
              <View style={styles.questionMeta}>
                <Text style={styles.step}>
                  Question {i + 1} of {survey.data.questions.length}
                </Text>
                {q.required ? null : <Text style={styles.optional}>Optional</Text>}
              </View>
              <Text style={styles.prompt}>{q.prompt}</Text>
              <SurveyQuestionInput
                question={q}
                answer={answers[q.id]}
                onChange={(a) => setAnswers((prev) => ({ ...prev, [q.id]: a }))}
                onTextFocus={() => {
                  focusedQuestion.current = q.id;
                  showQuestion(q.id);
                }}
                onTextBlur={() => {
                  focusedQuestion.current = null;
                }}
              />
            </View>
          ))}
        </ScrollView>
        {/* With the keyboard up the footer gives its room to the question: no
            system-bar padding, no shadow, and no Skip, which isn't needed mid-typing. */}
        <View
          style={[
            styles.footer,
            keyboardVisible ? styles.footerKeyboard : null,
            { paddingBottom: keyboardVisible ? spacing.md : bottomPadding },
          ]}
        >
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
          <Button
            title="Submit"
            disabled={problem !== null || busy}
            loading={submit.isPending}
            accessibilityHint={hint ?? undefined}
            onPress={() => submit.mutate(given, { onSuccess: () => setDone(true), onError: onMutationError })}
          />
          {keyboardVisible ? null : (
            <Button
              title="Skip"
              variant="text"
              disabled={busy}
              style={styles.skipButton}
              onPress={() => skip.mutate(id, { onSuccess: leave, onError: onMutationError })}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
