import React, { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { MotherSurveySummary } from '@nanny-app/shared';

import SurveyPromptSheet from '@mobile/components/SurveyPromptSheet';
import { useIsUpdateRequired, useIsVersionCheckSettled } from '@mobile/hooks/useAppVersionCheck';
import { usePendingRatingSettled } from '@mobile/hooks/usePendingRating';
import { PENDING_SURVEYS_KEY, usePendingSurveys, useSkipSurvey } from '@mobile/hooks/useSurveys';
import { navigateToSurvey } from '@mobile/lib/notificationNavigation';
import { useRatingPromptStore } from '@mobile/store/ratingPromptStore';
import { useUpdateSheetStore } from '@mobile/store/updateSheetStore';
import { markSurveyPrompted, pickSurveyToPrompt, promptedSurveys } from '@mobile/store/surveyPromptStore';

/**
 * Routes where a sheet would interrupt her: the survey itself (a push tap
 * lands there and refetches the list, which still has it pending), and the
 * booking and package flows, including the screens a Paymob return lands on.
 * Viewing a booking (detail, chat, care log) is not a task and still prompts.
 */
const QUIET_ROUTES: ReadonlySet<string> = new Set([
  '/survey',
  '/book/booking-step-1',
  '/book/booking-step-2',
  '/book/booking-step-3',
  '/book/booking-date-picker',
  '/book/booking-care-details',
  '/book/booking-confirmation',
  '/book/extension-checkout',
  '/book/adjustment-checkout',
  '/book/payment-result',
  '/book/review',
  '/packages/checkout',
  '/packages/review',
  '/packages/payment-result',
]);

/**
 * Mount once in the parent layout. On open (and on return to the foreground)
 * offers her oldest unanswered survey with Answer / Skip. Skip keeps it in her
 * profile list; only an admin's resend brings the prompt back. The rating
 * prompt goes first when both are due, and neither shows over the
 * update-required blocker. Nothing shows on QUIET_ROUTES.
 */
export default function SurveyPromptHost() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data } = usePendingSurveys();
  const skip = useSkipSurvey();
  const ratingShowing = useRatingPromptStore((s) => s.booking) !== null;
  // The blocker and the optional update sheet both win over the survey sheet.
  const updateRequired = useIsUpdateRequired();
  const updateSheetVisible = useUpdateSheetStore((s) => s.visible);
  const updateShowing = updateRequired || updateSheetVisible;
  // Both read as "not showing" while their queries load; wait until each has
  // answered so the survey sheet never has to make way in the same commit.
  const versionSettled = useIsVersionCheckSettled();
  const ratingSettled = usePendingRatingSettled();
  const othersSettled = versionSettled && ratingSettled;
  const quietRoute = QUIET_ROUTES.has(usePathname());
  const [current, setCurrent] = useState<MotherSurveySummary | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void queryClient.invalidateQueries({ queryKey: PENDING_SURVEYS_KEY });
    });
    return () => sub.remove();
  }, [queryClient]);

  useEffect(() => {
    if (!data) return;
    // A refetch can drop the survey under the sheet (closed, or answered
    // elsewhere), and opening it any other way (a push tap) marks it prompted.
    if (
      current &&
      (promptedSurveys().has(current.id) || !data.some((x) => x.id === current.id && x.status === 'PENDING'))
    ) {
      setCurrent(null);
      return;
    }
    if (current || !othersSettled || ratingShowing || updateShowing || quietRoute) return;
    setCurrent(pickSurveyToPrompt(data, promptedSurveys()));
  }, [data, current, othersSettled, ratingShowing, updateShowing, quietRoute]);

  if (!current || ratingShowing || updateShowing || quietRoute) return null;

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
