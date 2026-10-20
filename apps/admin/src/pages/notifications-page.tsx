import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import {
  Button,
  ErrorState,
  ICON_SIZE,
  PageHeader,
  Plus,
  StaleRefreshBanner,
  TableSkeleton,
} from '@admin/components/ui';
import { TemplateTable } from '@admin/features/notifications/template-table';
import { listNotificationTemplates } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

/** Notification templates: write once, publish to mothers any number of times. */
export function NotificationsPage() {
  const canManage = useCanManage('notifications');
  const navigate = useNavigate();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['notification-templates'],
    queryFn: listNotificationTemplates,
  });

  return (
    <section>
      <PageHeader
        title="Notification Center"
        subtitle="Write a notification once, then send it to mothers whenever you need to."
        action={
          canManage && (
            <Button onClick={() => navigate('/notifications/new')}>
              <Plus size={ICON_SIZE.inline} aria-hidden />
              New template
            </Button>
          )
        }
      />
      {isLoading && <TableSkeleton columns={9} />}
      {error != null && !data && (
        <ErrorState message={apiErrorMessage(error)} onRetry={() => void refetch()} retrying={isFetching} />
      )}
      {data && (
        <>
          {error != null && (
            <StaleRefreshBanner
              message={apiErrorMessage(error)}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}
          <TemplateTable templates={data} />
        </>
      )}
    </section>
  );
}
