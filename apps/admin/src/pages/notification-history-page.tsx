import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import { DetailHeader, ErrorState, LoadingState } from '@admin/components/ui';
import { BroadcastHistory } from '@admin/features/notifications/broadcast-history';
import { getNotificationTemplate } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

/** /notifications/:id/history — every send of one template, with its counts. */
export function NotificationHistoryPage() {
  const { id = '' } = useParams();
  const templateId = Number(id);
  const template = useQuery({
    queryKey: ['notification-templates', templateId],
    queryFn: () => getNotificationTemplate(templateId),
  });

  if (template.isLoading) return <LoadingState label="Loading send history…" />;
  if (template.error != null || !template.data) {
    return (
      <ErrorState
        message={apiErrorMessage(template.error)}
        onRetry={() => void template.refetch()}
        retrying={template.isFetching}
      />
    );
  }
  return (
    <section>
      <DetailHeader
        title="Send history"
        subtitle={`Every time “${template.data.name}” was published, with how many mothers it reached.`}
        backTo={`/notifications/${templateId}`}
        backLabel={template.data.name}
      />
      <BroadcastHistory templateId={templateId} />
    </section>
  );
}
