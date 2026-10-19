import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, ICON_SIZE, PageHeader, Plus, useToast } from '@admin/components/ui';
import { SurveyTable } from '@admin/features/surveys/survey-table';
import { createSurvey } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

/** Every survey sent to mothers. Groups have their own page (`/groups`). */
export function SurveysPage() {
  const canManage = useCanManage('surveys');
  const navigate = useNavigate();
  const toast = useToast();
  const [creating, setCreating] = useState(false);

  const newSurvey = async () => {
    setCreating(true);
    try {
      const survey = await createSurvey({ title: 'Untitled survey', questions: [] });
      navigate(`/surveys/${survey.id}`);
    } catch (err) {
      toast.error('Couldn’t create the survey', apiErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <section>
      <PageHeader
        title="Surveys"
        subtitle="Ask mothers questions and see their answers."
        action={
          canManage && (
            <Button onClick={() => void newSurvey()} disabled={creating}>
              <Plus size={ICON_SIZE.inline} aria-hidden />
              New survey
            </Button>
          )
        }
      />
      <SurveyTable />
    </section>
  );
}
