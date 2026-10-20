import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';

import { ErrorState, LoadingState } from '@admin/components/ui';
import { TemplateEditor } from '@admin/features/notifications/template-editor';
import { TemplateView } from '@admin/features/notifications/template-view';
import { getNotificationTemplate } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

/**
 * /notifications/:id — a saved template opens as its preview; ?edit=1 is its
 * editor. `new` is a blank editor whose first Save creates it.
 */
export function NotificationTemplatePage() {
  const { id = '' } = useParams();
  const canManage = useCanManage('notifications');
  const [searchParams, setSearchParams] = useSearchParams();
  const editing = canManage && searchParams.get('edit') === '1';
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
  if (editing) {
    return (
      <TemplateEditor
        key={template.data.id}
        template={template.data}
        onDone={() => setSearchParams({}, { replace: true })}
      />
    );
  }
  return (
    <TemplateView
      key={template.data.id}
      template={template.data}
      onEdit={() => setSearchParams({ edit: '1' }, { replace: true })}
    />
  );
}
