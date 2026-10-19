import React, { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { MotherSurveySummary } from '@nanny-app/shared';

import SurveyPromptSheet from '@mobile/components/SurveyPromptSheet';
import { PENDING_SURVEYS_KEY, usePendingSurveys, useSkipSurvey } from '@mobile/hooks/useSurveys';
import { navigateToSurvey } from '@mobile/lib/notificationNavigation';
import { useRatingPromptStore } from '@mobile/store/ratingPromptStore';
import { markSurveyPrompted, pickSurveyToPrompt, promptedSurveys } from '@mobile/store/surveyPromptStore';

/**
 * Mount once in the parent layout. On open (and on return to the foreground)
 * offers her oldest unanswered survey with Answer / Skip. Skip keeps it in her
 * profile list; only an admin's resend brings the prompt back. The rating
 * prompt goes first when both are due.
 */
export default function SurveyPromptHost() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data } = usePendingSurveys();
  const skip = useSkipSurvey();
  const ratingShowing = useRatingPromptStore((s) => s.booking) !== null;
  const [current, setCurrent] = useState<MotherSurveySummary | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void queryClient.invalidateQueries({ queryKey: PENDING_SURVEYS_KEY });
    });
    return () => sub.remove();
  }, [queryClient]);

  useEffect(() => {
    if (!data) return;
    // A refetch can drop the survey under the sheet (closed, or answered elsewhere).
    if (current && !data.some((x) => x.id === current.id && x.status === 'PENDING')) {
      setCurrent(null);
      return;
    }
    if (current || ratingShowing) return;
    setCurrent(pickSurveyToPrompt(data, promptedSurveys()));
  }, [data, current, ratingShowing]);

  if (!current || ratingShowing) return null;

  const close = () => {
    markSurveyPrompted(current.id);
    setCurrent(null);
  };
  return (
    <SurveyPromptSheet
      survey={current}
      onAnswer={() => {
        close();
        navigateToSurvey(router, current.id);
      }}
      onSkip={() => {
        skip.mutate(current.id);
        close();
      }}
      onDismiss={close}
    />
  );
}
