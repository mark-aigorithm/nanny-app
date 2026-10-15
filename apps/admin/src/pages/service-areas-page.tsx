import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  Button,
  ErrorState,
  ICON_SIZE,
  PageHeader,
  Plus,
  StaleRefreshBanner,
  Switch,
  TableSkeleton,
  useToast,
} from '@admin/components/ui';
import { ServiceAreaFormModal } from '@admin/features/service-areas/service-area-form';
import { ServiceAreaTable } from '@admin/features/service-areas/service-area-table';
import {
  fetchServiceAreaSettings,
  fetchServiceAreas,
  updateServiceAreaSettings,
} from '@admin/lib/api';
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

  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: settings } = useQuery({
    queryKey: ['service-area-settings'],
    queryFn: fetchServiceAreaSettings,
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => updateServiceAreaSettings({ enabled }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['service-area-settings'], saved);
      toast.success(
        saved.enabled ? 'Service areas switched on' : 'Service areas switched off',
        saved.enabled ? 'Booking is limited to the active areas.' : 'Mothers can book anywhere.',
      );
    },
    onError: (err) => toast.error('Could not save', apiErrorMessage(err)),
  });

  const activeCount = areas?.filter((a) => a.isActive).length ?? 0;
  // Until the switch has loaded, assume on — the backend's default.
  const enabled = toggle.isPending ? toggle.variables : (settings?.enabled ?? true);

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
          {canManage && (
            <div className="service-areas-switch">
              <Switch
                checked={enabled}
                onChange={(next) => toggle.mutate(next)}
                label="Limit booking to service areas"
              />
            </div>
          )}
          <p className="service-areas-summary">
            {!enabled
              ? 'Service areas are switched off — mothers can book anywhere, whatever areas are active.'
              : activeCount > 0
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
