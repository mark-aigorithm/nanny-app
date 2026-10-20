import { useQuery } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router-dom';

import { ErrorState, LoadingState } from '@admin/components/ui';
import { RecipientPicker } from '@admin/features/surveys/recipient-picker';
import { fetchSurvey } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

/**
 * /surveys/:id/publish and /surveys/:id/add-recipients — choosing who gets a
 * survey. Publish is for a draft with questions; adding is for a published
 * survey. Anything else, or a view-only operator, goes back to the survey.
 */
export function SurveyRecipientsPage({ mode }: { mode: 'publish' | 'add' }) {
  const { id = '' } = useParams();
  const surveyId = Number(id);
  const canManage = useCanManage('surveys');
  const survey = useQuery({
    queryKey: ['surveys', surveyId],
    queryFn: () => fetchSurvey(surveyId),
  });

  if (survey.isLoading) return <LoadingState label="Loading survey…" />;
  if (survey.error != null || !survey.data) {
    return (
      <ErrorState
        message={apiErrorMessage(survey.error)}
        onRetry={() => void survey.refetch()}
        retrying={survey.isFetching}
      />
    );
  }
  const { status, questions } = survey.data;
  const allowed =
    canManage &&
    (mode === 'publish' ? status === 'DRAFT' && questions.length > 0 : status === 'PUBLISHED');
  if (!allowed) return <Navigate to={`/surveys/${surveyId}`} replace />;
  return <RecipientPicker key={`${mode}-${surveyId}`} survey={survey.data} mode={mode} />;
}
