import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import { ErrorState, LoadingState } from '@admin/components/ui';
import { SurveyEditor } from '@admin/features/surveys/survey-editor';
import { fetchSurvey } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

/** /surveys/:id — the editor (the results view for published surveys arrives with Task 14). */
export function SurveyPage() {
  const { id = '' } = useParams();
  const surveyId = Number(id);
  const survey = useQuery({ queryKey: ['surveys', surveyId], queryFn: () => fetchSurvey(surveyId) });

  if (survey.isLoading) return <LoadingState label="Loading survey…" />;
  if (survey.error != null || !survey.data) {
    return <ErrorState message={apiErrorMessage(survey.error)} onRetry={() => void survey.refetch()} retrying={survey.isFetching} />;
  }
  return <SurveyEditor key={survey.data.id} survey={survey.data} />;
}
