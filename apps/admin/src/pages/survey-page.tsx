import type { AdminSurvey } from '@nanny-app/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';

import { ErrorState, LoadingState, useToast } from '@admin/components/ui';
import { RecipientPickerModal } from '@admin/features/surveys/recipient-picker-modal';
import { SurveyDetail } from '@admin/features/surveys/survey-detail';
import { SurveyEditor } from '@admin/features/surveys/survey-editor';
import { SurveyView } from '@admin/features/surveys/survey-view';
import { fetchSurvey } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

const BLANK_DRAFT: AdminSurvey = {
  id: 0,
  title: 'Untitled survey',
  description: null,
  status: 'DRAFT',
  counts: { recipients: 0, answered: 0, skipped: 0, pending: 0 },
  publishedAt: null,
  closedAt: null,
  createdAt: new Date(0).toISOString(),
  questions: [],
};

/**
 * /surveys/:id — a draft opens as its preview (?edit=1 is its editor, ?publish=1
 * its publish flow); a published or closed survey shows its results and recipients.
 */
export function SurveyPage() {
  const { id = '' } = useParams();
  const isNew = id === 'new';
  const surveyId = Number(id);
  const queryClient = useQueryClient();
  const toast = useToast();
  const canManage = useCanManage('surveys');
  const [searchParams, setSearchParams] = useSearchParams();
  const setParam = (param: 'edit' | 'publish' | null) =>
    setSearchParams(param ? { [param]: '1' } : {}, { replace: true });
  const survey = useQuery({
    queryKey: ['surveys', surveyId],
    queryFn: () => fetchSurvey(surveyId),
    enabled: !isNew,
  });

  // "New survey": a blank editor; its first Save creates the draft.
  if (isNew) return <SurveyEditor key="new" survey={BLANK_DRAFT} isNew />;

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
  const editing = canManage && searchParams.get('edit') === '1';
  // Only a draft with questions can be published, and only by someone who manages surveys.
  const publishing =
    canManage &&
    survey.data.status === 'DRAFT' &&
    survey.data.questions.length > 0 &&
    searchParams.get('publish') === '1';
  return (
    <>
      {survey.data.status === 'DRAFT' && editing ? (
        <SurveyEditor
          key={survey.data.id}
          survey={survey.data}
          onDone={(then) => setParam(then === 'publish' ? 'publish' : null)}
        />
      ) : survey.data.status === 'DRAFT' ? (
        <SurveyView
          key={survey.data.id}
          survey={survey.data}
          onEdit={() => setParam('edit')}
          onPublish={() => setParam('publish')}
        />
      ) : (
        <SurveyDetail survey={survey.data} />
      )}
      {publishing && (
        <RecipientPickerModal
          surveyId={surveyId}
          mode="publish"
          onClose={() => setParam(null)}
          onDone={(count) => {
            toast.success(`Sent to ${count} ${count === 1 ? 'mother' : 'mothers'}`);
            setParam(null);
            void queryClient.invalidateQueries({ queryKey: ['surveys'] });
          }}
        />
      )}
    </>
  );
}
