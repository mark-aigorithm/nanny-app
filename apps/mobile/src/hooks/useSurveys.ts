import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MotherSurvey, MotherSurveySummary, SurveyAnswerInput } from '@nanny-app/shared';
import { Role } from '@nanny-app/shared';

import { api, unwrap } from '@mobile/lib/api';
import { useAuthStore } from '@mobile/store/authStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

export const PENDING_SURVEYS_KEY = ['surveys', 'pending'] as const;
const surveyKey = (id: number) => ['surveys', id] as const;

/** Her PENDING and SKIPPED surveys — the prompt and the profile entry both read this. */
export function usePendingSurveys() {
  const firebaseUser = useAuthStore((s) => s.user);
  const role = useUserProfileStore((s) => s.profile?.role);
  return useQuery<MotherSurveySummary[]>({
    queryKey: PENDING_SURVEYS_KEY,
    enabled: !!firebaseUser && role === Role.MOTHER,
    queryFn: () => unwrap(api.get('/surveys/pending')),
  });
}

export function useSurvey(id: number) {
  return useQuery<MotherSurvey>({
    queryKey: surveyKey(id),
    enabled: Number.isFinite(id) && id > 0,
    queryFn: () => unwrap(api.get(`/surveys/${id}`)),
    retry: false,
  });
}

export function useSkipSurvey() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await unwrap(api.post(`/surveys/${id}/skip`));
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: PENDING_SURVEYS_KEY }),
  });
}

export function useSubmitSurvey(id: number) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, SurveyAnswerInput[]>({
    mutationFn: async (answers) => {
      await unwrap(api.post(`/surveys/${id}/answers`, { answers }));
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: PENDING_SURVEYS_KEY }),
  });
}
