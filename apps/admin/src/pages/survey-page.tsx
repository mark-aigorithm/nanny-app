import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { ErrorState, LoadingState, useToast } from '@admin/components/ui';
import { RecipientPickerModal } from '@admin/features/surveys/recipient-picker-modal';
import { SurveyDetail } from '@admin/features/surveys/survey-detail';
import { SurveyEditor } from '@admin/features/surveys/survey-editor';
import { fetchSurvey } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

/** /surveys/:id — the editor for a draft, the results and recipients view once published or closed. */
export function SurveyPage() {
  const { id = '' } = useParams();
  const surveyId = Number(id);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [publishing, setPublishing] = useState(false);
  const survey = useQuery({ queryKey: ['surveys', surveyId], queryFn: () => fetchSurvey(surveyId) });

  if (survey.isLoading) return <LoadingState label="Loading survey…" />;
  if (survey.error != null || !survey.data) {
    return <ErrorState message={apiErrorMessage(survey.error)} onRetry={() => void survey.refetch()} retrying={survey.isFetching} />;
  }
  return (
    <>
      {survey.data.status === 'DRAFT' ? (
        <SurveyEditor key={survey.data.id} survey={survey.data} onPublish={() => setPublishing(true)} />
      ) : (
        <SurveyDetail survey={survey.data} />
      )}
      {publishing && (
        <RecipientPickerModal
          surveyId={surveyId}
          mode="publish"
          onClose={() => setPublishing(false)}
          onDone={(count) => {
            toast.success(`Sent to ${count} ${count === 1 ? 'mother' : 'mothers'}`);
            setPublishing(false);
            void queryClient.invalidateQueries({ queryKey: ['surveys'] });
          }}
        />
      )}
    </>
  );
}
