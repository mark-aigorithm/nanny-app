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
import { ServiceAreaFormModal } from '@admin/features/service-areas/service-area-form';
import { ServiceAreaTable } from '@admin/features/service-areas/service-area-table';
import { fetchServiceAreas } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

export function ServiceAreasPage() {
  const canManage = useCanManage('serviceAreas');
  const [adding, setAdding] = useState(false);
  const {
    data: areas,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['service-areas'],
    queryFn: fetchServiceAreas,
  });

  const activeCount = areas?.filter((a) => a.isActive).length ?? 0;

  return (
    <section>
      <PageHeader
        title="Service Areas"
        subtitle="Mothers can book only at an address inside an active area. With no active area, booking is open everywhere."
        action={
          canManage && (
            <Button onClick={() => setAdding(true)}>
              <Plus size={ICON_SIZE.inline} aria-hidden />
              Add area
            </Button>
          )
        }
      />
      {isLoading && <TableSkeleton columns={6} />}
      {error != null && !areas && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {areas && (
        <>
          {error != null && (
            <StaleRefreshBanner
              message={apiErrorMessage(error)}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}
          <p className="service-areas-summary">
            {activeCount > 0
              ? `${activeCount} active area${activeCount === 1 ? '' : 's'} — booking is limited to ${activeCount === 1 ? 'it' : 'them'}.`
              : 'No active area — mothers can book anywhere.'}
          </p>
          <ServiceAreaTable areas={areas} />
        </>
      )}
      {adding && <ServiceAreaFormModal onClose={() => setAdding(false)} />}
    </section>
  );
}
