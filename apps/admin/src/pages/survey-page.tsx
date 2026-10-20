import type { AdminSurvey } from '@nanny-app/shared';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { ErrorState, LoadingState } from '@admin/components/ui';
import { SurveyDetail } from '@admin/features/surveys/survey-detail';
import { SurveyEditor } from '@admin/features/surveys/survey-editor';
import { SurveyView } from '@admin/features/surveys/survey-view';
import { fetchSurvey } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

const BLANK_DRAFT: AdminSurvey = {
  id: 0,
  // Empty, not "Untitled survey": a placeholder title would be saved as the real one.
  title: '',
  status: 'DRAFT',
  counts: { recipients: 0, answered: 0, skipped: 0, pending: 0 },
  publishedAt: null,
  closedAt: null,
  createdAt: new Date(0).toISOString(),
  questions: [],
};

/**
 * /surveys/:id — a draft opens as its preview (?edit=1 is its editor; Publish
 * goes to /surveys/:id/publish); a published or closed survey shows its results
 * and recipients.
 */
export function SurveyPage() {
  const { id = '' } = useParams();
  const isNew = id === 'new';
  const surveyId = Number(id);
  const canManage = useCanManage('surveys');
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const setEditing = (on: boolean) => setSearchParams(on ? { edit: '1' } : {}, { replace: true });
  // Publishing (picking who gets it) is its own page.
  const openPublish = () => navigate(`/surveys/${surveyId}/publish`, { replace: true });
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
  return (
    <>
      {survey.data.status === 'DRAFT' && editing ? (
        <SurveyEditor
          key={survey.data.id}
          survey={survey.data}
          onDone={(then) => (then === 'publish' ? openPublish() : setEditing(false))}
        />
      ) : survey.data.status === 'DRAFT' ? (
        <SurveyView
          key={survey.data.id}
          survey={survey.data}
          onEdit={() => setEditing(true)}
          onPublish={() => navigate(`/surveys/${surveyId}/publish`)}
        />
      ) : (
        <SurveyDetail survey={survey.data} />
      )}
    </>
  );
}
