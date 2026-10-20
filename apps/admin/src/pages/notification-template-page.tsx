import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import { ErrorState, LoadingState } from '@admin/components/ui';
import { TemplateEditor } from '@admin/features/notifications/template-editor';
import { getNotificationTemplate } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

/** /notifications/:id — one template's editor. `new` is a blank editor whose first Save creates it. */
export function NotificationTemplatePage() {
  const { id = '' } = useParams();
  const isNew = id === 'new';
  const templateId = Number(id);
  const template = useQuery({
    queryKey: ['notification-templates', templateId],
    queryFn: () => getNotificationTemplate(templateId),
    enabled: !isNew,
  });

  if (isNew) return <TemplateEditor key="new" />;
  if (template.isLoading) return <LoadingState label="Loading notification…" />;
  if (template.error != null || !template.data) {
    return (
      <ErrorState
        message={apiErrorMessage(template.error)}
        onRetry={() => void template.refetch()}
        retrying={template.isFetching}
      />
    );
  }
  return <TemplateEditor key={template.data.id} template={template.data} />;
}
