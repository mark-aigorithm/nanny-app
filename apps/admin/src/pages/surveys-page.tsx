import { useNavigate } from 'react-router-dom';

import { Button, ICON_SIZE, PageHeader, Plus } from '@admin/components/ui';
import { SurveyTable } from '@admin/features/surveys/survey-table';
import { useCanManage } from '@admin/lib/permissions';

/** Every survey sent to mothers. Groups have their own page (`/groups`). */
export function SurveysPage() {
  const canManage = useCanManage('surveys');
  const navigate = useNavigate();
  return (
    <section>
      <PageHeader
        title="Surveys"
        subtitle="Ask mothers questions and see their answers."
        action={
          canManage && (
            // The draft is created by the editor's first Save, so an abandoned click leaves nothing behind.
            <Button onClick={() => navigate('/surveys/new')}>
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
