import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  Button,
  ErrorState,
  ICON_SIZE,
  PageHeader,
  Plus,
  StaleRefreshBanner,
  TableSkeleton,
} from '@admin/components/ui';
import { OperatorFormModal } from '@admin/features/operators/operator-form';
import { OperatorTable } from '@admin/features/operators/operator-table';
import { fetchAdmins } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

/**
 * Who can sign in to the console. The route itself is superuser-only
 * (`SuperuserOnly` in app.tsx), so whoever sees this page may manage the team.
 */
export function AdminsPage() {
  const [adding, setAdding] = useState(false);
  const {
    data: admins,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['admins'],
    queryFn: fetchAdmins,
  });

  return (
    <section>
      <PageHeader
        title="Team"
        subtitle="Who can sign in to the console, and how far each of them reaches. Only the superuser can see this page."
        action={
          <Button onClick={() => setAdding(true)}>
            <Plus size={ICON_SIZE.inline} aria-hidden />
            Add team member
          </Button>
        }
      />
      {isLoading && <TableSkeleton columns={8} />}
      {error != null && !admins && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {admins && (
        <>
          {error != null && (
            <StaleRefreshBanner
              message={apiErrorMessage(error)}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}
          <OperatorTable admins={admins} />
        </>
      )}
      {adding && <OperatorFormModal onClose={() => setAdding(false)} />}
    </section>
  );
}
